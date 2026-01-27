import { Injectable, Logger } from '@nestjs/common';
import { DocumentProcessorService } from './document-processor.service';
import { Subject, concatMap } from 'rxjs';

@Injectable()
export class AnalysisQueue {
  private readonly logger = new Logger(AnalysisQueue.name);
  private jobSubject = new Subject<string>();

  constructor(private readonly processor: DocumentProcessorService) {
    // Process jobs sequentially (or use mergeMap for concurrency)
    this.jobSubject
      .pipe(
        concatMap(async documentId => {
          this.logger.log(`Starting job for document: ${documentId}`);
          try {
            await this.processor.processDocumentFromUrl(documentId);
            this.logger.log(`Job completed for document: ${documentId}`);
          } catch (error) {
            this.logger.error(`Job failed for document ${documentId}: ${error}`);
          }
        })
      )
      .subscribe();
  }

  addJob(documentId: string) {
    this.logger.log(`Queuing job for document: ${documentId}`);
    this.jobSubject.next(documentId);
  }
}
