import frappe

def execute():
    roles = [
        "Gameplan Admin",
        "Gameplan Member",
        "System User"
    ]

    doctype = "Page"

    for role in roles:
        exists = frappe.db.exists(
            "DocPerm",
            {
                "parent": doctype,
                "role": role,
                "permlevel": 0
            }
        )

        if exists:
            frappe.db.set_value("DocPerm", exists, "read", 1)
        else:
            frappe.get_doc({
                "doctype": "DocPerm",
                "parent": doctype,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": role,
                "read": 1,
                "write": 1 if role == "Gameplan Admin" else 0,
                "create": 0,
                "delete": 0,
                "permlevel": 0
            }).insert(ignore_permissions=True)

    frappe.db.commit()
