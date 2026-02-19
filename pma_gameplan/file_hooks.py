import frappe
import os

def make_pma_files_public(doc, method):
    # Only affect PMA Post and PMA Post Comment attachments
    if doc.attached_to_doctype not in ["PMA Post", "PMA Post Comment"]:
        return

    if doc.is_private:
        old_path = frappe.get_site_path("private", "files", doc.file_name)
        new_path = frappe.get_site_path("public", "files", doc.file_name)

        if os.path.exists(old_path):
            os.makedirs(os.path.dirname(new_path), exist_ok=True)
            os.rename(old_path, new_path)

        frappe.db.set_value("File", doc.name, {
            "file_url": f"/files/{doc.file_name}",
            "is_private": 0
        })
