import fitz
from pathlib import Path

docs = Path(r"D:\Project\Exim\EOS\docs")
files = [
    docs / "1582008459.pdf",
    docs / "PO 1012014246_PRISCOLIN_QINGDAO GLOBAL.pdf",
]
out_dir = docs / "_pdf_scan"
out_dir.mkdir(exist_ok=True)

for pdf_path in files:
    print(f"\n{'=' * 80}\nFILE: {pdf_path.name}\n{'=' * 80}")
    doc = fitz.open(pdf_path)
    print(f"Pages: {doc.page_count}")
    for i, page in enumerate(doc):
        text = page.get_text("text").strip()
        print(f"\n--- Page {i + 1} embedded text ({len(text)} chars) ---")
        if text:
            print(text[:5000])
            if len(text) > 5000:
                print("...[truncated]")
        else:
            print("(no embedded text)")
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        img_path = out_dir / f"{pdf_path.stem}_page{i + 1}.png"
        pix.save(str(img_path))
        print(f"Rendered: {img_path.name} ({pix.width}x{pix.height})")
    doc.close()
