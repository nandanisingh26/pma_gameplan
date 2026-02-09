frappe.ready(() => {
  if (!frappe.session.user || frappe.session.user === "Guest") return;

  frappe.call({
    method: "frappe.client.get",
    args: {
      doctype: "User",
      name: frappe.session.user
    },
    callback(r) {
      const roles = (r.message.roles || []).map(r => r.role);

      if (roles.includes("PMA Admin")) {
        window.location.href = "/app/pma-admin-dashboard";
      } 
      else if (roles.includes("PMA Member")) {
        window.location.href = "/app/pma-member-dashboard";
      }
    }
  });
});