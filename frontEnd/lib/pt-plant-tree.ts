import type { PtPlantTreeNode } from "@/types/masters";

export type PtPlantConfig =
  | { mode: "fixed"; plant: string }
  | { mode: "select"; plants: readonly string[] }
  | { mode: "none" };

export function canonicalizePtLabel(stored: string | null | undefined, labels: readonly string[] = []): string {
  const t = (stored ?? "").trim();
  if (t === "") return "";
  return labels.find((label) => label.toLowerCase() === t.toLowerCase()) ?? t;
}

export function findCompanyNode(tree: PtPlantTreeNode[], pt: string): PtPlantTreeNode | undefined {
  const t = pt.trim().toLowerCase();
  if (!t) return undefined;
  return tree.find((node) => node.name.toLowerCase() === t);
}

export function getPlantConfigForCompany(node: PtPlantTreeNode | undefined): PtPlantConfig {
  if (!node) return { mode: "none" };
  const names = node.plants.map((p) => p.name).filter(Boolean);
  if (names.length === 0) return { mode: "none" };
  if (names.length === 1) return { mode: "fixed", plant: names[0]! };
  return { mode: "select", plants: names };
}

export function getPlantConfigForPt(tree: PtPlantTreeNode[], pt: string): PtPlantConfig {
  return getPlantConfigForCompany(findCompanyNode(tree, pt));
}

export function getAllPlantsSorted(tree: PtPlantTreeNode[]): string[] {
  const set = new Set<string>();
  for (const node of tree) {
    for (const plant of node.plants) {
      if (plant.name) set.add(plant.name);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
