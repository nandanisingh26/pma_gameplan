import frappe

PERMANENT_ADMINS = [
    "nandani.singh@prettl.com"
]

GAMEPLAN_ADMIN_ROLE = "Gameplan Admin"

def enforce_gameplan_admin(doc, method=None):
    if doc.email in PERMANENT_ADMINS:
        roles = [r.role for r in doc.roles]

        if GAMEPLAN_ADMIN_ROLE not in roles:
            doc.add_roles(GAMEPLAN_ADMIN_ROLE)

        if "System User" not in roles:
            doc.add_roles("System User")
