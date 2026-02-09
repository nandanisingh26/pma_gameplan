frappe.pages["pma-gameplan"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "PMA Gameplan",
    single_column: false
  });

  const $wrapper = $(wrapper);
  $wrapper.addClass("pma-gameplan-page");

  const $layout = $(`
    <div class="pma-layout">
      <div class="pma-sidebar">
        <div class="pma-sidebar-item active" data-view="posts">📝 Posts</div>
        <div class="pma-sidebar-item" data-view="spaces">🗂 Spaces</div>
        <div class="pma-sidebar-item" data-view="tasks">✅ Tasks</div>
        <div class="pma-sidebar-item" data-view="people">👤 People</div>
      </div>

      <div class="pma-content">
        <div id="pma-view"></div>
      </div>
    </div>
  `);

  $(page.body).append($layout);

  /* ---------------- RENDER VIEW ---------------- */

  function render_view(view) {
    const $view = $("#pma-view");
    $view.empty();

    /* -------- POSTS -------- */
    if (view === "posts") {
      $view.append(`
        <div class="pma-header-bar">
          <h3>Posts</h3>
          <button class="btn btn-primary btn-sm" id="new-pma-post">New Post</button>
        </div>
        <div id="pma-post-feed"></div>
      `);

      $("#new-pma-post").on("click", open_new_post_dialog);

      frappe.call({
        method: "pma_gameplan.api.get_posts",
        callback(r) {
          const posts = r.message || [];
          const $feed = $("#pma-post-feed");

          if (!posts.length) {
            $feed.append("<p class='text-muted'>No posts yet.</p>");
            return;
          }

          posts.forEach(p => $feed.append(render_post_card(p)));
        }
      });
    }

    /* -------- SPACES -------- */
    if (view === "spaces") {
      $view.append(`
        <h3>Spaces</h3>
        <p class="text-muted">Spaces coming soon.</p>
      `);
    }

    /* -------- TASKS -------- */
    if (view === "tasks") {
      $view.append(`
        <h3>Tasks</h3>
        <p class="text-muted">Tasks coming soon.</p>
      `);
    }

    /* -------- PEOPLE -------- */
    if (view === "people") {
      const is_admin = frappe.user.has_role("PMA Admin");

      $view.append(`
        <div class="pma-header-bar">
          <h3>People</h3>
          ${is_admin ? `
            <button class="btn btn-primary btn-sm" id="add-pma-member">
              Add Member
            </button>` : ``}
        </div>

        <div id="pma-people-list"></div>
      `);

      if (is_admin) {
        $("#add-pma-member").on("click", open_add_member_dialog);
      }

      frappe.call({
        method: "pma_gameplan.api.get_people",
        callback(r) {
          const people = r.message || [];
          const $list = $("#pma-people-list");
          $list.empty();

          if (!people.length) {
            $list.append("<p class='text-muted'>No members found.</p>");
            return;
          }

          people.forEach(m => $list.append(render_person_card(m)));
        }
      });
    }
  }

  /* -------- SIDEBAR NAV -------- */

  $layout.on("click", ".pma-sidebar-item", function () {
    $(".pma-sidebar-item").removeClass("active");
    $(this).addClass("active");
    render_view($(this).data("view"));
  });

  render_view("posts");
};

/* ================= DIALOGS ================= */

function open_new_post_dialog() {
  let uploaded_file = null;

  const d = new frappe.ui.Dialog({
    title: "New Post",
    size: "large",
    fields: [
      {
        fieldname: "title",
        label: "Title",
        fieldtype: "Data",
        reqd: 1
      },
      {
        fieldname: "post_type",
        label: "Post Type",
        fieldtype: "Select",
        options: ["Post", "Announcement"],
        default: "Post"
      },

      {
        fieldtype: "Section Break",
        label: "Attachment"
      },
      {
        fieldname: "attachment",
        label: "Attachment",
        fieldtype: "Button"
      },

      {
        fieldtype: "Section Break"
      },
      {
        fieldname: "content",
        label: "Content",
        fieldtype: "Text Editor",
        reqd: 1
      }
    ],
    primary_action_label: "Publish",
    primary_action(values) {
      frappe.call({
        method: "pma_gameplan.api.create_post",
        args: {
          title: values.title,
          post_type: values.post_type,
          content: values.content,
          attachment: uploaded_file
        },
        callback() {
          d.hide();
          frappe.show_alert({
            message: "Post published",
            indicator: "green"
          });
          location.reload();
        }
      });
    }
  });

  d.show();

  // 🔥 ATTACH HANDLER (THIS IS THE KEY)
  d.fields_dict.attachment.$input.on("click", () => {
    new frappe.ui.FileUploader({
      allow_multiple: false,
      on_success(file) {
        uploaded_file = file.file_url;
        frappe.show_alert({
          message: `Attached: ${file.file_name}`,
          indicator: "green"
        });
      }
    });
  });
}


function open_add_member_dialog() {
  const d = new frappe.ui.Dialog({
    title: "Add Member",
    fields: [
      {
        fieldname: "email",
        fieldtype: "Data",
        label: "Email",
        reqd: 1
      },
      {
        fieldname: "role",
        fieldtype: "Select",
        label: "Role",
        options: ["PMA Admin", "PMA Member"],
        default: "PMA Member",
        reqd: 1
      }
    ],
    primary_action_label: "Invite",
    primary_action(values) {
      frappe.call({
        method: "pma_gameplan.api.invite_member",
        args: values,
        callback(r) {
          d.hide();

          // ✅ SUCCESS NOTIFICATION
          frappe.show_alert({
            message: `Invitation sent to <b>${values.email}</b>`,
            indicator: "green"
          });

          // Refresh People list
          render_view("people");
        }
      });
    }
  });

  d.show();
}


function open_edit_member_dialog(member_name) {
  frappe.call({
    method: "pma_gameplan.api.get_member",
    args: { name: member_name },
    callback(r) {
      const m = r.message;

      const d = new frappe.ui.Dialog({
        title: "Edit Member",
        fields: [
          {
            fieldname: "role",
            label: "Role",
            fieldtype: "Select",
            options: ["PMA Admin", "PMA Member"],
            default: m.role
          },
          {
            fieldname: "status",
            label: "Status",
            fieldtype: "Select",
            options: ["Active", "Inactive"],
            default: m.status
          }
        ],
        primary_action_label: "Update",
        primary_action(values) {
          frappe.call({
            method: "pma_gameplan.api.update_member",
            args: {
              name: member_name,
              role: values.role,
              status: values.status
            },
            callback() {
              d.hide();
              frappe.show_alert("Member updated", "green");
              location.reload();
            }
          });
        }
      });

      d.add_custom_action("Deactivate", () => {
        frappe.confirm("Deactivate this member?", () => {
          frappe.call({
            method: "pma_gameplan.api.update_member",
            args: {
              name: member_name,
              role: m.role,
              status: "Inactive"
            },
            callback() {
              d.hide();
              frappe.show_alert("Member deactivated", "orange");
              location.reload();
            }
          });
        });
      }, "danger");

      d.show();
    }
  });
}

/* ================= RENDER CARDS ================= */

function render_post_card(post) {
  const attachment = post.attachment
    ? `<div class="mt-2">
         📎 <a href="${post.attachment}" target="_blank">Download attachment</a>
       </div>`
    : "";

  return `
    <div class="pma-post-card">
      <strong>${post.title}</strong>
      <div class="text-muted">
        ${post.author || ""} • ${frappe.datetime.str_to_user(post.published_on)}
      </div>
      <div>${post.content || ""}</div>
      ${attachment}
    </div>
  `;
}


$(document).on("click", ".pma-person-card", function () {
  open_edit_member_dialog($(this).data("member"));
});

