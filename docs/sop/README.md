# SOP layout and images

Keep the original SOP visual style for future updates: US Letter pages (612 x 792 pt), Helvetica, navy #0f172a headings, teal #155e75 subheadings, a small logo at the top right, dark numbered circles and rounded grey notes. Admin-only sections use pale red banners. Mobile screenshots sit beside the numbered steps; wider desktop captures stay on the same page at readable size.

Run `python docs/build_sop.py` from this repository to rebuild `PanelStock_SOP.pdf` and `SOP.md`. Requires ReportLab and Pillow. The builder includes the instructions and image layout; keep it and the screenshots together.

`original-*` images were recovered from the original SOP. Current `mobile-*` and `desktop-*` captures use isolated test data. Preserve source images; the PDF layout frames relevant regions where appropriate. Review all rendered pages after changes. Do not remove the images or replace the layout with a new design unless requested.
