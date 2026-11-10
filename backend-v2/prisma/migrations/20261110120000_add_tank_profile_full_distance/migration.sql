-- Where "full" is, kept apart from where the sensor goes blind. Null on
-- existing rows: full is then assumed to be the nearest the sensor can see.
ALTER TABLE `tank_profiles` ADD COLUMN `full_distance_cm` DECIMAL(10, 2) NULL;
