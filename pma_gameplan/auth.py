import frappe

@frappe.whitelist(allow_guest=True)
def check_user_exists(email):
    return {
        "exists": frappe.db.exists("User", email)
    }

def ensure_pma_member(login_manager):
    user = frappe.session.user
    if user == "Guest":
        return

    if frappe.db.exists("PMA Member", {"user": user}):
        return

    user_doc = frappe.get_doc("User", user)

    frappe.get_doc({
        "doctype": "PMA Member",
        "user": user,
        "full_name": user_doc.full_name,
        "email": user_doc.email
    }).insert(ignore_permissions=True)

@frappe.whitelist(allow_guest=True)
def register_user(full_name, email, password):
    if frappe.db.exists("User", email):
        frappe.throw("User already exists")

    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": full_name,
        "enabled": 1,
        "send_welcome_email": 0
    }).insert(ignore_permissions=True)

    user.new_password = password
    user.save(ignore_permissions=True)

    frappe.local.login_manager.login(email, password)