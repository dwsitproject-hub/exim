import { PoEdit } from "./PoEdit";

export default function PoEditPage({ params }: { params: { id: string } }) {
  return <PoEdit id={params.id} />;
}
