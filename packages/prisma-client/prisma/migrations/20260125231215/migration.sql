-- DropForeignKey
ALTER TABLE "vehicle_models" DROP CONSTRAINT "vehicle_models_makeId_fkey";

-- AddForeignKey
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_makeId_fkey" FOREIGN KEY ("makeId") REFERENCES "vehicle_makes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
