import { IsDefined, IsNotEmpty, IsString } from 'class-validator';

/** One conversational answer: validates against the shared flow definition. */
export class PatchAnswerDto {
  @IsString()
  @IsNotEmpty()
  stepId!: string;

  /** string | number | boolean — validated per-step by the shared flow. */
  @IsDefined()
  value!: string | number | boolean;
}
