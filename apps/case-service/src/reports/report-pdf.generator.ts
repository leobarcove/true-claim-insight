import PDFDocument from 'pdfkit';
import { AdjusterReportStatus, AdjusterReportType } from '@prisma/client';
import { aiAssistedSections, templateFor, type ReportSections } from './report-templates';

/**
 * Renders an adjuster's report to PDF.
 *
 * The architecture audit found the only existing PDF in the system — the Trinity
 * fraud output — carried no author, no methodology and no sources, which is
 * precisely what PD 12.6 requires and what makes a document an adjuster's report
 * rather than a machine printout. This renderer therefore treats the attribution
 * block and the disclosure sections as structure, not decoration:
 *
 *  - the author's name and licence number appear on the face of the report
 *    (PD 12.7 — reports are authored by adjusting employees, identifiably so);
 *  - every PD 12.6 section is printed with the paragraph it satisfies;
 *  - AI-assisted sections are marked in the body and summarised in the
 *    attribution block (§6: AI is disclosed, never downplayed);
 *  - a draft is watermarked, so an unissued report cannot be mistaken for one
 *    that was sent to the insurer.
 */

export interface ReportPdfData {
  report: {
    type: AdjusterReportType;
    status: AdjusterReportStatus;
    version: number;
    sections: ReportSections;
    issuedAt: Date | null;
    signedAt: Date | null;
    countersignBasis: string | null;
    supersedesId: string | null;
  };
  claim: { claimNumber: string; policyNumber: string };
  author: { fullName: string; licenceNumber: string };
  signedBy?: { fullName: string; licenceNumber: string } | null;
  firmName: string;
}

const INK = '#1A202C';
const MUTED = '#4A5568';
const RULE = '#CBD5E0';
const FLAG = '#B7791F';

const formatDate = (date: Date | null): string =>
  date ? date.toISOString().slice(0, 10) : '—';

const titleCase = (value: string): string =>
  value.charAt(0) + value.slice(1).toLowerCase();

export class ReportPdfGenerator {
  generate(data: ReportPdfData): Promise<Buffer> {
    // bufferPages so the draft watermark can be stamped across every page after
    // the content is laid out and the page count is known.
    const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        this.render(doc, data);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private render(doc: PDFKit.PDFDocument, data: ReportPdfData): void {
    const { report, claim, author, signedBy, firmName } = data;

    this.heading(doc, data);
    this.attribution(doc, data);

    for (const template of templateFor(report.type)) {
      const content = report.sections?.[template.key];
      this.section(doc, template.heading, content?.body ?? '', {
        basis: template.regulatoryBasis,
        aiAssisted: Boolean(content?.aiAssisted),
      });
    }

    this.signature(doc, { author, signedBy, report, firmName, claim });

    if (report.status !== AdjusterReportStatus.ISSUED) {
      this.watermark(doc, report.status);
    }
  }

  private heading(doc: PDFKit.PDFDocument, data: ReportPdfData): void {
    const { report, claim, firmName } = data;

    doc.fillColor(INK).fontSize(17).font('Helvetica-Bold');
    doc.text(`${titleCase(report.type)} Adjuster's Report`);

    doc.moveDown(0.2).fontSize(9).font('Helvetica').fillColor(MUTED);
    doc.text(firmName);

    doc.moveDown(0.6);
    const meta = [
      `Claim ${claim.claimNumber}`,
      `Policy ${claim.policyNumber}`,
      `Version ${report.version}`,
      `Issued ${formatDate(report.issuedAt)}`,
    ];
    doc.fontSize(9).text(meta.join('    ·    '));

    if (report.supersedesId) {
      doc.moveDown(0.3).fillColor(FLAG).fontSize(9);
      doc.text(`This report supersedes an earlier issued version. The superseded report remains on file.`);
    }

    this.rule(doc);
  }

  /**
   * Attribution and AI disclosure.
   *
   * Placed before the content deliberately: a reader must know who is speaking,
   * and on what basis, before they read the conclusion.
   */
  private attribution(doc: PDFKit.PDFDocument, data: ReportPdfData): void {
    const { report, author } = data;

    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('Prepared by');
    doc.font('Helvetica').fillColor(INK);
    doc.text(`${author.fullName}  ·  Licence ${author.licenceNumber}`);

    const aiSections = aiAssistedSections(report.sections ?? {});
    doc.moveDown(0.4).fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
    doc.text('Use of automated analysis');
    doc.font('Helvetica').fillColor(aiSections.length ? FLAG : INK);
    doc.text(
      aiSections.length
        ? `Automated analysis contributed to the following sections: ${aiSections.join(', ')}. ` +
            'All conclusions remain those of the named adjuster.'
        : 'No automated analysis contributed to the content of this report.'
    );

    this.rule(doc);
  }

  private section(
    doc: PDFKit.PDFDocument,
    heading: string,
    body: string,
    options: { basis?: string; aiAssisted: boolean }
  ): void {
    // Keep a heading with at least a little of its body rather than orphaning it.
    if (doc.y > doc.page.height - 140) doc.addPage();

    doc.moveDown(0.5).fillColor(INK).fontSize(11).font('Helvetica-Bold');
    doc.text(heading, { continued: Boolean(options.aiAssisted) });

    if (options.aiAssisted) {
      doc.font('Helvetica').fontSize(8).fillColor(FLAG).text('   [automated analysis contributed]');
    }

    if (options.basis) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text(options.basis);
    }

    doc.moveDown(0.25).font('Helvetica').fontSize(10).fillColor(INK);
    // An empty mandatory section cannot reach issue, but a draft render must show
    // the gap rather than silently printing nothing.
    doc.text(body?.trim() || '— not yet completed —', { align: 'left', lineGap: 1.5 });
  }

  private signature(
    doc: PDFKit.PDFDocument,
    data: Pick<ReportPdfData, 'author' | 'signedBy' | 'report' | 'firmName' | 'claim'>
  ): void {
    const { report, signedBy } = data;

    if (doc.y > doc.page.height - 190) doc.addPage();
    this.rule(doc);

    doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold').text('Signed');
    doc.font('Helvetica').fillColor(INK);

    if (signedBy) {
      doc.text(`${signedBy.fullName}  ·  Licence ${signedBy.licenceNumber}`);
      doc.fillColor(MUTED).fontSize(9).text(`Signed ${formatDate(report.signedAt)}`);
    } else {
      doc.fillColor(FLAG).text('Unsigned — this report has not been signed off.');
    }

    if (report.countersignBasis) {
      doc.moveDown(0.4).fillColor(MUTED).fontSize(8).font('Helvetica-Oblique');
      doc.text(`Sign-off basis: ${report.countersignBasis}`);
    }

    doc.moveDown(0.8).font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(
      'This report is an assessment prepared for the appointing insurer. The settlement ' +
        'decision rests with the insurer.',
      { lineGap: 1 }
    );
  }

  private watermark(doc: PDFKit.PDFDocument, status: AdjusterReportStatus): void {
    const range = doc.bufferedPageRange();

    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.save();
      doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.fillColor('#E53E3E').opacity(0.12).fontSize(78).font('Helvetica-Bold');
      doc.text(status, 0, doc.page.height / 2 - 40, { align: 'center' });
      doc.restore().opacity(1);
    }
  }

  private rule(doc: PDFKit.PDFDocument): void {
    doc.moveDown(0.5);
    doc.strokeColor(RULE).lineWidth(0.5).moveTo(56, doc.y).lineTo(doc.page.width - 56, doc.y).stroke();
    doc.moveDown(0.5);
  }
}
