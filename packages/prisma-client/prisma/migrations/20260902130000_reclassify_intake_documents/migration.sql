-- Multipart fields used to be read before the file stream was consumed.
-- Fastify had not parsed the fields yet, so conversational evidence was saved
-- as OTHER_DOCUMENT with no stepId. The Case answer still holds the uploaded
-- document id under the correct document step, which lets us repair both
-- values without guessing from filenames or upload order.
UPDATE "case_documents" AS document
SET
  "documentType" = mapping.document_type::"DocumentType",
  "stepId" = mapping.step_id
FROM "cases" AS intake_case
CROSS JOIN (
  VALUES
    ('doc-airline-delay-confirmation', 'AIRLINE_DELAY_CONFIRMATION'),
    ('doc-boarding-pass', 'BOARDING_PASS'),
    ('doc-flight-itinerary', 'FLIGHT_ITINERARY'),
    ('doc-pir', 'PROPERTY_IRREGULARITY_REPORT'),
    ('doc-baggage-tag', 'BAGGAGE_TAG'),
    ('doc-damage-photo', 'DAMAGE_PHOTO'),
    ('doc-proof-of-ownership', 'PROOF_OF_OWNERSHIP'),
    ('doc-medical-report', 'MEDICAL_REPORT'),
    ('doc-booking-invoice', 'TRAVEL_BOOKING_INVOICE'),
    ('doc-overseas-medical-bill', 'OVERSEAS_MEDICAL_BILL'),
    ('doc-passport', 'PASSPORT')
) AS mapping(step_id, document_type)
WHERE document."caseId" = intake_case.id
  AND document."documentType" = 'OTHER_DOCUMENT'
  AND document."stepId" IS NULL
  AND intake_case.answers ->> mapping.step_id = document.id;
