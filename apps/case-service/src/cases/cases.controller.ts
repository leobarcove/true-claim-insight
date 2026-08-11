import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CasesService } from './cases.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { PatchAnswerDto } from './dto/patch-answer.dto';
import { CaseQueryDto, LinkPolicyDto, ReviewCaseDto } from './dto/review-case.dto';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';

const STAFF_ROLES = [UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN] as const;
// Intake endpoints: claimant self-serve plus adjusting staff. RolesGuard treats
// missing @Roles metadata as allow-all, so every route must declare its list —
// otherwise support/compliance roles reach claimant PII and bank details.
const INTAKE_ROLES = [UserRole.CLAIMANT, ...STAFF_ROLES] as const;

@ApiTags('cases')
@ApiBearerAuth()
@Controller({ path: 'cases', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class CasesController {
  constructor(private readonly service: CasesService) {}

  @Post()
  @Roles(...INTAKE_ROLES)
  @ApiOperation({ summary: 'Create a travel intake case (claimant or staff)' })
  create(@Body() dto: CreateCaseDto, @Tenant() tenantContext: TenantContext) {
    return this.service.create(dto, tenantContext);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Vetting queue: list cases for the current tenant' })
  findAll(@Query() query: CaseQueryDto, @Tenant() tenantContext: TenantContext) {
    return this.service.findAll(query, tenantContext);
  }

  @Get('mine')
  @Roles(UserRole.CLAIMANT)
  @ApiOperation({ summary: "List the authenticated claimant's own cases" })
  findMine(@Tenant() tenantContext: TenantContext) {
    return this.service.findMine(tenantContext);
  }

  @Get(':id')
  @Roles(...INTAKE_ROLES)
  @ApiOperation({ summary: 'Case detail with documents, checklist and flow state' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.findOne(id, tenantContext);
  }

  @Get(':id/flow')
  @Roles(...INTAKE_ROLES)
  @ApiOperation({
    summary: 'The full intake flow this case is walking — its pinned version',
    description:
      'Fetched once per case by the claimant app to rebuild the transcript and render each ' +
      'step. Returns the version pinned at creation, so a flow published mid-conversation ' +
      'does not change the questions already asked.',
  })
  getFlow(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.getFlowForCase(id, tenantContext);
  }

  @Patch(':id/answers')
  @Roles(...INTAKE_ROLES)
  @ApiOperation({ summary: 'Save one intake answer and advance the conversation' })
  patchAnswer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchAnswerDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.patchAnswer(id, dto, tenantContext);
  }

  @Post(':id/documents/upload')
  @Roles(...INTAKE_ROLES)
  @ApiOperation({ summary: 'Upload an intake evidence document (multipart)' })
  async upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Tenant() tenantContext: TenantContext
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.uploadDocument(id, file, tenantContext);
  }

  @Get(':id/documents')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'The evidence attached to a case' })
  listDocuments(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.listDocuments(id, tenantContext);
  }

  /**
   * The bytes of one document.
   *
   * Staff only, and never the claimant: this returns whatever was uploaded to
   * a case, and a claimant proving ownership of one document is not a reason
   * to hand them the rest. Vetting is the reason it exists — an operator was
   * being asked to approve evidence they had no way to look at.
   */
  @Get(':id/documents/:documentId/content')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Download or display one evidence document' })
  async documentContent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Tenant() tenantContext: TenantContext,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const file = await this.service.readDocument(id, documentId, tenantContext);

    // Only known-safe types render in place. Anything else downloads, because
    // displaying claimant-supplied markup on the portal's own origin would run
    // it with an operator's session.
    const disposition = file.inlineRenderable ? 'inline' : 'attachment';
    reply.header('Content-Type', file.mimeType);
    reply.header(
      'Content-Disposition',
      `${disposition}; filename="${encodeURIComponent(file.fileName)}"`
    );
    // Personal data: cacheable by the operator's own browser for the session,
    // never by anything in between.
    reply.header('Cache-Control', 'private, max-age=300');
    return new StreamableFile(file.buffer);
  }

  @Post(':id/submit')
  @Roles(...INTAKE_ROLES)
  @ApiOperation({ summary: 'Submit the case for operator vetting' })
  submit(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.submit(id, tenantContext);
  }

  @Post(':id/request-info')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Ask the claimant for more information' })
  requestInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCaseDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.requestInfo(id, dto.note, tenantContext);
  }

  @Post(':id/refer-expert')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Refer a medical case to a claims expert' })
  referToExpert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCaseDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.referToExpert(id, dto.note, tenantContext);
  }

  @Get(':id/payout-details')
  // Firm admins only, and every call is audited — see revealPayoutDetails.
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Decrypt payout bank details (audited)' })
  revealPayoutDetails(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.revealPayoutDetails(id, tenantContext);
  }

  @Post(':id/link-policy')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Manually link a policy to the case' })
  linkPolicy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkPolicyDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.linkPolicy(id, dto.policyId, tenantContext);
  }

  @Post(':id/convert')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Convert the case into a Claim + TravelClaim (insurer handback)' })
  convert(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.convert(id, tenantContext);
  }

  @Post(':id/reject')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Reject the case with a reason' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCaseDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.reject(id, dto.note, tenantContext);
  }
}
