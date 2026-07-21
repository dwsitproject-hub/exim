import styles from "./ExportDocumentLetterhead.module.css";

export type ExportDocumentLetterheadProps = {
  /** Uploaded shipper header image URL (blob or authenticated). */
  imageUrl?: string | null;
  /** Text letterhead company name when no image is configured. */
  name: string;
  /** Optional class on the root header element. */
  className?: string;
};

export function ExportDocumentLetterhead({
  imageUrl,
  name,
  className,
}: ExportDocumentLetterheadProps) {
  const rootClass = className ? `${styles.header} ${className}` : styles.header;

  if (imageUrl) {
    return (
      <header className={rootClass}>
        <img src={imageUrl} alt="" className={styles.letterheadImage} />
      </header>
    );
  }

  return (
    <header className={rootClass}>
      <h1 className={styles.companyName}>{name}</h1>
      <hr className={styles.rule} />
    </header>
  );
}

/** Footer company line — prefers shipper entity name when header image is used. */
export function exportDocumentFooterCompanyName(
  letterheadName: string,
  shipperFooterName?: string | null,
  usedImageHeader?: boolean,
): string {
  if (usedImageHeader && shipperFooterName?.trim()) {
    return shipperFooterName.trim().replace(/\./g, "").toUpperCase();
  }
  return letterheadName.replace(/\./g, "").toUpperCase();
}
