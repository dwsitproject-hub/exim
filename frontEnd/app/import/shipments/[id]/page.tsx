import { ShipmentDetail } from "./ShipmentDetail";

export default function ShipmentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <ShipmentDetail id={params.id} />;
}
