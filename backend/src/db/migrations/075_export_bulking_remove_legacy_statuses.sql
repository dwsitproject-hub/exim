-- Export Bulking: remove legacy documentation/voyage statuses from workflow.
-- SI_RECEIVE and NPE are no longer operational statuses; documentation is tracked separately.

UPDATE export_bulking_shipments
SET current_status = 'ARRIVAL'
WHERE current_status = 'SI_RECEIVE';

UPDATE export_bulking_shipments
SET current_status = 'LOADING'
WHERE current_status = 'NPE';
