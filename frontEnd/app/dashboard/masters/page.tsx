import type { Metadata } from "next";
import { MasterDataPage } from "./MasterDataPage";

export const metadata: Metadata = {
  title: "Master data",
};

export default function MastersRoute() {
  return <MasterDataPage />;
}
