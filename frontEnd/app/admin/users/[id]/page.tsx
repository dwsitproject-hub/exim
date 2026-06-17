import { UserEdit } from "./UserEdit";

export default function EditUserPage({ params }: { params: { id: string } }) {
  return <UserEdit userId={params.id} />;
}
