import { PoDetail } from "./PoDetail";

export default function PoDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <PoDetail id={params.id} />;
}
