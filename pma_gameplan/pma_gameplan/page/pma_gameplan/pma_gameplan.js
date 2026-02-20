let current_filter = "all";
let current_sort = "newest";
let all_people = [];
let current_space_filter = "public";
let all_spaces = [];
window.all_spaces = all_spaces;

frappe.pages["pma-gameplan"].on_page_load = function (wrapper) {

  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: "PMA Gameplan",
    single_column: true
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

  // ✅ sidebar click — ONLY here
  $layout.on("click", ".pma-sidebar-item", function () {
    $(".pma-sidebar-item").removeClass("active");
    $(this).addClass("active");
    render_view($(this).data("view"));
  });

  // ✅ initial render — ONLY here
  render_view("posts");
};

/* ---------------- RENDER VIEW ---------------- */
function render_view(view) {
  const $view = $("#pma-view");
  $view.empty();

  /* -------- PEOPLE -------- */
  if (view === "people") {
    const is_admin = frappe.user.has_role("Gameplan Admin");

    $view.append(`
      <div class="pma-header-bar d-flex justify-content-between align-items-center">
        <h3>People</h3>
        ${is_admin ? `
          <button class="btn btn-primary btn-sm" id="add-pma-member">
            Add Member
          </button>
        ` : ``}
      </div>

      <input
        type="text"
        class="form-control mb-3"
        id="pma-people-search"
        placeholder="Search people..."
      />

      <div id="pma-people-list"></div>
    `);

    if (is_admin) {
      $("#add-pma-member").on("click", open_add_member_dialog);
    }

    load_people();
    return;
  }

/* -------- POSTS -------- */
if (view === "posts") {

  const is_admin = frappe.user.has_role("Gameplan Admin");

  $view.append(`
    <div class="pma-posts-toolbar">
      <div class="pma-posts-filters">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="unread">Unread</button>
        <button class="filter-btn" data-filter="bookmarked">Bookmarks</button>
      </div>

      <div class="pma-posts-actions">
        <select id="post-sort" class="form-control form-control-sm">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="creation">Creation date</option>
        </select>

        ${is_admin ? `
          <button class="btn btn-primary btn-sm" id="new-pma-post">
            New Post
          </button>
        ` : ``}
      </div>
    </div>

    <div id="pma-post-feed"></div>
  `);

  wire_post_events();
  load_posts();
    $view.find("#new-pma-post").on("click", function (e) {
    e.preventDefault();
    open_new_post_dialog();
  });

  return;
}



  /* -------- SPACES -------- */
  if (view === "spaces") {
    render_spaces_ui($view);
    return;
  }

  /* -------- TASKS -------- */
  if (view === "tasks") {
    $view.append(`
      <div class="pma-tasks-wrapper">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h3 class="mb-0">My Tasks</h3>
          <button class="btn btn-primary btn-sm" id="create-task-btn">
            + Add new
          </button>
        </div>

        <div class="mb-3">
          <div class="btn-group btn-group-sm pma-task-filters">
            <button class="btn btn-light active" data-filter="all">All</button>
            <button class="btn btn-light" data-filter="assigned">Assigned to me</button>
            <button class="btn btn-light" data-filter="created">Created by me</button>
          </div>
        </div>

        <div id="tasks-container"></div>
      </div>
    `);

    load_tasks();
    return;
  }
}


/* -------- PEOPLE -------- */

function open_add_member_dialog() {
  const d = new frappe.ui.Dialog({
    title: "Add Gameplan Member",
    fields: [
      {
        fieldname: "email",
        label: "Email",
        fieldtype: "Data",
        reqd: 1
      },
      {
        fieldname: "role",
        label: "Role",
        fieldtype: "Select",
        options: "Gameplan Member\nGameplan Admin",
        default: "Gameplan Member"
      }
    ],
    primary_action_label: "Invite",
    primary_action(values) {
      document.activeElement?.blur();   // 👈 add this
      frappe.call({
        method: "pma_gameplan.api.invite_member",
        args: values,
        callback() {
          d.hide();
          frappe.show_alert("Member invited");
          load_people(); // reload list
        }
      });
    }
  });

  d.show();
}

function load_people() {
  frappe.call({
    method: "pma_gameplan.api.get_people",
    callback(r) {
      all_people = r.message || [];
      render_people(all_people);
    }
  });
}


/*--------------------tasks----------------------*/

function open_new_task_dialog() {
  frappe.call({
    method: "pma_gameplan.api.get_my_spaces",
    callback: function (r) {

      const spaces = r.message || [];

      const space_options = spaces.map(s => ({
        label: s.space_name,
        value: s.name
      }));

      const d = new frappe.ui.Dialog({
        title: "New Task",
        size: "large",
        fields: [

          {
            fieldname: "title",
            label: "Title",
            fieldtype: "Data",
            reqd: 1
          },

          {
            fieldname: "description",
            label: "Description",
            fieldtype: "Small Text"
          },

          {
            fieldtype: "Column Break"
          },

          {
  fieldname: "assigned_to",
  label: "Assigned To",
  fieldtype: "Link",
  options: "PMA Member",
  get_query: function () {
    return {
      query: "pma_gameplan.api.get_assignable_members",
      filters: {
        space: cur_space // pass selected space if needed
      }
    };
  }
},

          {
            fieldname: "start_date",
            label: "Set start date",
            fieldtype: "Date"
          },

          {
            fieldname: "end_date",
            label: "Set due date",
            fieldtype: "Date"
          },

          {
            fieldtype: "Section Break"
          },

          {
            fieldname: "space",
            label: "Select space",
            fieldtype: "Select",
            options: space_options,
            reqd: 1
          },

          {
            fieldname: "status",
            label: "Status",
            fieldtype: "Select",
            options: "Open\nIn Progress\nCompleted",
            default: "Open"
          },

          {
            fieldname: "priority",
            label: "Priority",
            fieldtype: "Select",
            options: "Low\nMedium\nHigh",
            default: "Medium"
          }

        ],
        primary_action_label: "Create",
        primary_action(values) {
          frappe.call({
            method: "pma_gameplan.api.create_task",
            args: { data: values },
            callback() {
              d.hide();
              load_tasks();
            }
          });
        }
      });

      d.show();
    }
  });
}



 function load_tasks() {
  frappe.call({
    method: "pma_gameplan.api.get_tasks",
    args: {
      filter_type: current_task_filter
    },
    callback: function (r) {
      render_tasks(r.message || []);
    }
  });
}

function render_tasks(tasks) {

  const is_admin = frappe.user.has_role("Gameplan Admin");

  let html = "";

  if (!tasks.length) {
    html = `<div class="text-muted">No tasks found.</div>`;
  } else {

    tasks.forEach(task => {

  html += `
  <div class="pma-task-card card mb-3 p-3"
       data-name="${task.name}"
       style="${is_admin ? 'cursor:pointer;' : 'cursor:default;'}">

    <div class="task-title font-weight-bold mb-2">
      ${task.title}
    </div>

    <div class="task-meta-row">

      <div class="task-meta-item">
        <span class="task-label">Status:</span>
        <select class="task-field" data-field="status">
          <option value="Open" ${task.status==="Open"?"selected":""}>Open</option>
          <option value="In Progress" ${task.status==="In Progress"?"selected":""}>In Progress</option>
          <option value="Completed" ${task.status==="Completed"?"selected":""}>Completed</option>
        </select>
      </div>

      <div class="task-meta-item">
        <span class="task-label">Priority:</span>
        <select class="task-field" data-field="priority">
          <option value="Low" ${task.priority==="Low"?"selected":""}>Low</option>
          <option value="Medium" ${task.priority==="Medium"?"selected":""}>Medium</option>
          <option value="High" ${task.priority==="High"?"selected":""}>High</option>
        </select>
      </div>

      <div class="task-meta-item">
        <span class="task-label">Progress:</span>
        <select class="task-field" data-field="progress">
          <option value="0%" ${task.progress==="0%"?"selected":""}>0%</option>
          <option value="25%" ${task.progress==="25%"?"selected":""}>25%</option>
          <option value="50%" ${task.progress==="50%"?"selected":""}>50%</option>
          <option value="75%" ${task.progress==="75%"?"selected":""}>75%</option>
          <option value="100%" ${task.progress==="100%"?"selected":""}>100%</option>
        </select>
      </div>

    </div>

  </div>
`;


});

  }

  $("#tasks-container").html(html);

if (is_admin) {
  $(".pma-task-card").on("click", function (e) {

    if ($(e.target).is("select")) return;

    const name = $(this).data("name");
    frappe.set_route("Form", "PMA Task", name);

  });
}
}

function open_task_preview_dialog(task_name) {

  frappe.call({
    method: "pma_gameplan.api.get_task_preview",
    args: { name: task_name },
    callback(r) {

      const task = r.message;

      if (!task) return;

      const d = new frappe.ui.Dialog({
        title: task.title,
        size: "large",
        fields: [
          {
            fieldtype: "HTML",
            fieldname: "preview_html"
          }
        ],
        primary_action_label: "Close",
        primary_action() {
          d.hide();
        }
      });

      d.fields_dict.preview_html.$wrapper.html(`
        <div class="pma-task-preview">

          <div class="mb-3">
            <strong>Status:</strong> ${task.status}
            &nbsp; • &nbsp;
            <strong>Priority:</strong> ${task.priority}
            &nbsp; • &nbsp;
            <strong>Progress:</strong> ${task.progress}
          </div>

          <div class="mb-3">
            <strong>Assigned To:</strong> ${task.assigned_to_name || "-"}
          </div>

          <div class="mb-3">
            <strong>Start Date:</strong> ${task.start_date || "-"}
            &nbsp; • &nbsp;
            <strong>Due Date:</strong> ${task.end_date || "-"}
          </div>

          <hr>

          <div>
            <strong>Description</strong>
            <div class="mt-2">
              ${task.description || "<span class='text-muted'>No description</span>"}
            </div>
          </div>

        </div>
      `);

      d.show();
    }
  });

}




let current_task_filter = "all";


$(document).on("click", ".pma-task-filters button", function () {

  $(".pma-task-filters button").removeClass("active");
  $(this).addClass("active");

  current_task_filter = $(this).data("filter");

  load_tasks();
});

$(document).on("click", "#create-task-btn", function () {
  open_new_task_dialog();
});


$(document).on("change", ".task-field", function (e) {

  e.stopPropagation();

  const $card = $(this).closest(".pma-task-card");
  const name = $card.data("name");
  const field = $(this).data("field");
  const value = $(this).val();

  frappe.call({
    method: "pma_gameplan.api.update_task_field",
    args: { name, field, value },
    callback() {
      frappe.show_alert({
        message: "Updated",
        indicator: "green"
      });
    }
  });

});

const is_admin = frappe.user.has_role("Gameplan Admin");




function render_people(list) {
  const $list = $("#pma-people-list");
  $list.empty();

  if (!list.length) {
    $list.append("<p class='text-muted'>No members found.</p>");
    return;
  }

  list.forEach(m => $list.append(render_person_card(m)));
}

$(document).on("input", "#pma-people-search", function () {
  const q = $(this).val().toLowerCase();

  const filtered = all_people.filter(m =>
    (m.full_name || "").toLowerCase().includes(q) ||
    (m.email || "").toLowerCase().includes(q) ||
    (m.role || "").toLowerCase().includes(q)
  );

  render_people(filtered);
});



function render_person_card(m) {
  const is_admin = frappe.user.has_role("Gameplan Admin");

  const editBtn = is_admin
    ? `
      <button
        class="btn btn-xs btn-light pma-edit-member"
        data-user="${m.name}"
        title="Edit User">
        ✏️
      </button>
    `
    : "";

  return `
    <div class="pma-person-card ${is_admin ? "is-admin" : "is-not-admin"}">
      <div class="pma-person-main">
        <div class="pma-avatar">
          ${(m.full_name || m.name || "?").charAt(0)}
        </div>

        <div class="pma-person-info">
          <div class="pma-person-name">
            ${m.full_name || m.name}
          </div>
          <div class="pma-person-meta">
            ${m.email || ""}
          </div>
        </div>
      </div>

      <div class="pma-person-actions">
        <button
          class="btn btn-xs btn-light pma-view-member"
          data-user="${m.user}"
          title="View User">
          👁️
        </button>

        ${editBtn}
      </div>
    </div>
  `;
}


$(document).on("click", ".pma-edit-member", function (e) {
  e.preventDefault();
  e.stopImmediatePropagation();

  const user = $(this).attr("data-user");

  if (!user) {
    frappe.msgprint("User missing on edit button");
    return;
  }

  window.location.href = `/app/user/${encodeURIComponent(user)}`;
});







$(document).on("click", ".pma-view-member", function (e) {
  e.preventDefault();
  e.stopPropagation();

  const member = $(this).data("member");

  // 🛑 IMPORTANT GUARD
  if (!member) return;

  const $card = $(this).closest(".pma-person-card");

  // toggle existing view
  if ($card.find(".gameplan-member-view").length) {
    $card.find(".gameplan-member-view").remove();
    return;
  }

  frappe.call({
    method: "pma_gameplan.api.get_member",
    args: { name: member },
    callback(r) {
      const m = r.message;

      $card.append(`
        <div class="gameplan-member-view mt-2">
          <div><strong>Name:</strong> ${m.full_name}</div>
          <div><strong>Email:</strong> ${m.email}</div>
          <div><strong>Role:</strong> ${m.role}</div>
          <div><strong>Status:</strong> ${m.status}</div>
        </div>
      `);
    }
  });
});




function wire_post_events() {
  $(document).on("click", ".filter-btn", function () {
    $(".filter-btn").removeClass("active");
    $(this).addClass("active");
    current_filter = $(this).data("filter");
    load_posts();
  });

  $(document).on("change", "#post-sort", function () {
    current_sort = $(this).val();
    load_posts();
  });

}


function load_posts() {
frappe.call({
method: "pma_gameplan.api.get_posts",
args: {
filter: current_filter,
sort: current_sort
},
callback(r) {
const posts = r.message || [];
const $feed = $("#pma-post-feed");

$feed.empty();

if (!posts.length) {
$feed.append("<p class='text-muted'>No posts found.</p>");
return;
}

posts.forEach(p => $feed.append(render_post_card(p)));
}
});
}
// 🔓 expose globally for reactions/comments
window.load_posts = load_posts;


/* ================= DIALOGS ================= */


function open_new_post_dialog(default_space = null) {
  let uploaded_files = [];

  const dialog = new frappe.ui.Dialog({
    title: default_space ? `New Post in ${default_space}` : "New Post",
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
    options: [
      "Post",
      "Announcement",
      "Information",
      "Survey",
      "On-Boarding",
      "Off-Boarding",
      "Celebration"
    ],
    default: "Post"
  },
  {
  fieldname: "space",
  label: "Space",
  fieldtype: "Link",
  options: "PMA Space",
  ignore_user_permissions: 1
},

  

  // 🔴 DO NOT put HTML here

  {
    fieldname: "content",
    label: "Content",
    fieldtype: "Text Editor",
    reqd: 1
  },

{
  fieldtype: "Section Break"
},

  // ✅ Attachments AFTER editor
  {
    fieldtype: "HTML",
    fieldname: "attachments_html",
    options: `
      <div class="pma-attachments mt-3">
        <button class="btn btn-default btn-sm" id="add-attachment">
          📎 Add Attachments
        </button>
        <ul class="pma-attachment-list mt-2"></ul>
      </div>
    `
  }
],
  primary_action_label: "Publish",
  primary_action(values) {

    if (!values.title) {
      frappe.msgprint("Title is required");
      return;
    }

    frappe.call({
      method: "pma_gameplan.api.create_post",
      args: {
        title: values.title,
        content: values.content,
        post_type: values.post_type,
        space: values.space || null,
        attachments: uploaded_files || []
      },
      callback: function (r) {

        if (!r.exc) {
          dialog.hide();

          frappe.show_alert({
            message: "Post published",
            indicator: "green"
          });

          if (values.space) {
            load_space_posts(values.space);
          } else {
            load_posts();
          }
        }
      }
    });

  }   // ✅ CLOSE primary_action

});   // ✅ CLOSE Dialog config

dialog.show();


dialog.$wrapper.find("#add-attachment").on("click", function () {

  new frappe.ui.FileUploader({
    dialog: true,
    multiple: true,
    make_attachments_public: true,
    on_success(file) {

      uploaded_files.push({
        file: file.file_url,
        file_name: file.file_name,
        file_type: file.file_type
      });

    }
  });

});
}

function open_edit_post_dialog(post_name) {
frappe.call({
method: "pma_gameplan.api.get_post",
args: { name: post_name },
callback(r) {
const post = r.message;

const d = new frappe.ui.Dialog({
title: "Edit Post",
size: "large",
fields: [
{
fieldname: "title",
label: "Title",
fieldtype: "Data",
reqd: 1,
default: post.title
},
{
fieldname: "post_type",
label: "Post Type",
fieldtype: "Select",
options: [
"Post",
"Announcement",
"Information",
"Survey",
"On-Boarding",
"Off-Boarding",
"Celebration"
],
default: post.post_type
},

{
fieldname: "content",
label: "Content",
fieldtype: "Text Editor",
reqd: 1,
default: post.content
}
],
primary_action_label: "Update",
primary_action(values) {
frappe.call({
method: "pma_gameplan.api.update_post",
args: {
name: post_name,
title: values.title,
post_type: values.post_type,
content: values.content
},
callback() {
d.hide();
frappe.show_alert({
message: "Post updated",
indicator: "green"
});
load_posts();
}
});
}
});

d.add_custom_action("Delete", () => {
frappe.confirm("Delete this post permanently?", () => {
frappe.call({
method: "pma_gameplan.api.delete_post",
args: { name: post_name },
callback() {
d.hide();
frappe.show_alert({
message: "Post deleted",
indicator: "red"
});
load_posts();
}
});
});
}, "danger");

d.show();
}
});
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
options: ["Gameplan Admin", "Gameplan Member"],
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

d.add_custom_action(
"Deactivate",
() => {
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
frappe.show_alert({
message: "Member deactivated",
indicator: "orange"
});
load_posts();
}
});
});
},
"danger"
);

d.show();
}
});
}

/* ================= RENDER CARDS ================= */

function load_spaces() {
  frappe.call({
    method: "pma_gameplan.api.get_spaces",
    args: {
      filter_type: current_space_filter
    },
    callback: function (r) {
      all_spaces = r.message || [];
      render_spaces_list();   // ✅ THIS ONLY
    }
  });
}


function render_spaces_list() {
  const list = $(".pma-spaces-list");
  list.empty();

  let filtered = all_spaces;

  // Public = not private AND not archived
  if (current_space_filter === "public") {
    filtered = all_spaces.filter(s => !s.is_private && !s.is_archived);
  }

  // Private = private AND not archived
  if (current_space_filter === "private") {
    filtered = all_spaces.filter(s => s.is_private && !s.is_archived);
  }

  // Archived = archived only
  if (current_space_filter === "archived") {
    filtered = all_spaces.filter(s => s.is_archived);
  }

  if (!filtered.length) {
    list.append("<p class='text-muted'>No spaces found.</p>");
    return;
  }

  filtered.forEach(s => {
    list.append(`
      <div class="pma-space-card mb-2 d-flex justify-content-between align-items-center"
           data-space="${s.name}">
        <strong>${s.space_name}</strong>
        <button
          class="btn btn-sm btn-light pma-space-menu-btn"
          data-space="${s.name}"
          data-is-admin="${Number(s.is_admin) === 1 ? 1 : 0}">
          ⋮
        </button>
      </div>
    `);
  });
}



function show_space_menu(target, items) {
  $(".pma-context-menu").remove(); // close existing

  const $menu = $(`
    <div class="pma-context-menu">
      ${items.map(i => `
        <div class="pma-context-item ${i.class || ""}">
          ${i.label}
        </div>
      `).join("")}
    </div>
  `);

  $("body").append($menu);

  const offset = $(target).offset();
  $menu.css({
    top: offset.top + $(target).outerHeight(),
    left: offset.left - $menu.outerWidth() + $(target).outerWidth()
  });

  $menu.find(".pma-context-item").each(function (idx) {
    $(this).on("click", () => {
      items[idx].action?.();
      $menu.remove();
    });
  });

  $(document).one("click", () => $menu.remove());
}



function open_new_space_dialog() {
const d = new frappe.ui.Dialog({
title: "New Space",
fields: [
{
fieldtype: "Data",
fieldname: "space_name",
label: "Space name",
reqd: 1
},
{
fieldtype: "Select",
fieldname: "space_type",
label: "Category",
options: ["Department", "Branch"],
reqd: 1
},
{
fieldtype: "Check",
fieldname: "is_private",
label: "Keep it private — Only visible to members"
},
],
primary_action_label: "Create",
primary_action(values) {
console.log(values); 

frappe.call({
method: "pma_gameplan.api.create_space",
args: values,
callback() {
d.hide();
load_spaces();
frappe.show_alert({
message: "Space created",
indicator: "green"
});
}
});
}
});

d.show();
}

function manage_space_members(space) {
  const d = new frappe.ui.Dialog({
    title: "Manage Members",
    size: "large",
    fields: [
      {
        fieldtype: "HTML",
        fieldname: "members_html"
      }
    ]
  });

  d.show();
  load_space_members(space, d);
}
function load_space_members(space, dialog) {
  frappe.call({
    method: "pma_gameplan.api.get_space_members",
    args: { space },
    callback(r) {
      const members = r.message || [];

      const html = `
        <div class="mb-3">
          <button class="btn btn-sm btn-primary add-space-member">
            + Add Member
          </button>
        </div>

        <table class="table table-bordered">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th style="width:120px">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${members.map(m => `
              <tr>
                <td>${m.full_name}</td>
                <td>${m.email}</td>
                <td>
                  <select class="form-control form-control-sm space-role"
                    data-member="${m.member}">
                    <option ${m.role === "Admin" ? "selected" : ""}>Admin</option>
                    <option ${m.role === "Member" ? "selected" : ""}>Member</option>
                  </select>
                </td>
                <td>
                  <button class="btn btn-xs btn-danger remove-space-member"
                    data-member="${m.member}">
                    Remove
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

      dialog.fields_dict.members_html.$wrapper.html(html);

      wire_space_member_events(space, dialog);
    }
  });
}
function wire_space_member_events(space, dialog) {

  // Add member
  dialog.$wrapper.find(".add-space-member").on("click", () => {
    open_add_space_member_dialog(space, dialog);
  });

  // Change role
  dialog.$wrapper.find(".space-role").on("change", function () {
    frappe.call({
      method: "pma_gameplan.api.add_space_member",
      args: {
        space,
        user: $(this).data("member"),
        role: $(this).val()
      }
    });
  });

  // Remove member
  dialog.$wrapper.find(".remove-space-member").on("click", function () {
    const member = $(this).data("member");

    frappe.confirm("Remove this member from space?", () => {
      frappe.call({
        method: "pma_gameplan.api.remove_space_member",
        args: { space, member },
        callback() {
          load_space_members(space, dialog);
        }
      });
    });
  });
}
function open_add_space_member_dialog(space, parent_dialog) {
  const d = new frappe.ui.Dialog({
    title: "Add Member",
    fields: [
      {
        fieldtype: "Link",
        fieldname: "member",
        label: "Member",
        options: "PMA Member",
        reqd: 1
      },
      {
        fieldtype: "Select",
        fieldname: "role",
        label: "Role",
        options: ["Member", "Admin"],
        default: "Member"
      }
    ],
    primary_action_label: "Add",
    primary_action(values) {
      frappe.call({
        method: "pma_gameplan.api.add_space_member",
        args: {
          space,
          user: values.member,
          role: values.role
        },
        callback() {
          d.hide();
          load_space_members(space, parent_dialog);
        }
      });
    }
  });

  d.show();
}



function render_spaces_ui($view) {
  $view.append(`
    <div class="pma-spaces-header d-flex justify-content-between align-items-center mb-3">
  <h3>Spaces</h3>
  ${frappe.user.has_role("Gameplan Admin") ? `
    <button class="btn btn-primary btn-sm pma-add-space">
      + Add new
    </button>
  ` : ``}
</div>


    <div class="pma-spaces-toolbar mb-3">
      <input class="form-control mb-2"
      placeholder="Search (Ctrl + F)" />

      <div class="pma-space-filters btn-group btn-group-sm">
        <button class="btn btn-default active" data-filter="public">Public</button>
        <button class="btn btn-default" data-filter="private">Private</button>
        <button class="btn btn-default" data-filter="archived">Archived</button>
      </div>
    </div>

    <div class="pma-spaces-list"></div>
  `);

  load_spaces();


  $view.find(".pma-add-space").on("click", open_new_space_dialog);

  $view.find(".pma-space-filters button").on("click", function () {
  $view.find(".pma-space-filters button").removeClass("active");
  $(this).addClass("active");

  current_space_filter = $(this).data("filter");

  load_spaces();   // ✅ CALL BACKEND AGAIN
});

}

function render_comment(comment, level = 0) {
  const margin = level * 24;

  let html = `
  <div class="pma-comment"
       data-comment="${comment.name}"
       data-author="${comment.author}"
       style="margin-left:${margin}px">

    <div class="pma-comment-meta">
      <strong>${comment.author_name}</strong>
      <span class="text-muted">
        • ${frappe.datetime.str_to_user(comment.creation)}
      </span>

      <span class="pma-comment-menu-trigger">⋯</span>
    </div>

    <div class="pma-comment-content">
      ${link_mentions(comment.content)}
    </div>

    <span class="pma-reply-btn text-muted">Reply</span>
  `;

if (comment.replies?.length) {
comment.replies.forEach(r => {
html += render_comment(r, level + 1);
});
}

html += `</div>`;
return html;
}

function linkify_urls(text) {
if (!text) return "";
return text.replace(
/(https?:\/\/[^\s<]+)/g,
`<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>`
);
}
function link_mentions(text) {
return text.replace(
/@([a-zA-Z0-9._-]+)/g,
`<a href="/app/user/$1" class="pma-mention">@$1</a>`
);
}
/*------------------dropdown toggle logic-------------- */
$(document).on("click", ".pma-comment-menu-trigger", function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    $(".pma-comment-menu").remove(); // close others

    const $comment = $(this).closest(".pma-comment");
    const commentName = $comment.data("comment");
    const author = $comment.data("author");

    const isAuthor = author === frappe.session.user;
    const isAdmin = frappe.user.has_role("Gameplan Admin");

    if (!isAuthor && !isAdmin) return;

    const $menu = $(`
        <div class="pma-comment-menu">
            <div class="pma-edit-comment">Edit</div>
            <div class="pma-delete-comment text-danger">Delete</div>
        </div>
    `);

    $comment.append($menu);
});
$(document).on("click", function () {
    $(".pma-comment-menu").remove();
});

/*--------delete comment------*/
$(document).on("click", ".pma-delete-comment", function (e) {
    e.stopPropagation();

    const comment = $(this).closest(".pma-comment").data("comment");

    frappe.confirm("Delete this comment?", () => {
        frappe.call({
            method: "pma_gameplan.api.delete_comment",
            args: { name: comment },
            callback: function () {
                load_posts();
            }
        });
    });
});


/*-------------------edit comment inline-------------------------*/
$(document).on("click", ".pma-edit-comment", function (e) {
    e.stopPropagation();

    const $comment = $(this).closest(".pma-comment");
    const commentName = $comment.data("comment");
    const currentText = $comment.find(".pma-comment-content").text();

    $comment.find(".pma-comment-content").html(`
        <textarea class="pma-edit-input form-control"
            rows="2">${currentText}</textarea>
        <button class="btn btn-primary btn-xs mt-1 pma-save-comment">
            Save
        </button>
    `);
});
$(document).on("click", ".pma-save-comment", function () {

    const $comment = $(this).closest(".pma-comment");
    const commentName = $comment.data("comment");
    const newContent = $comment.find(".pma-edit-input").val();

    frappe.call({
        method: "pma_gameplan.api.update_comment",
        args: {
            name: commentName,
            content: newContent
        },
        callback: function () {
            load_posts();
        }
    });
});




function render_post_card(post) {
const is_admin = frappe.user.has_role("Gameplan Admin");

const attachments_html = (post.attachments || [])
.map(a => `
<li>
<a href="${a.file || a.file_url}" target="_blank">
📎 ${a.file_name}
</a>
</li>
`)
.join("");

const $card = $(`
<div class="pma-post-card" data-post="${post.name}">

  <div class="pma-post-main">
      <strong>${post.title}</strong>

      <div class="text-muted">
        ${post.author_name} • ${frappe.datetime.str_to_user(post.published_on)}
      </div>

      <div class="pma-post-content"></div>
  </div>

  ${attachments_html ? `
    <ul class="pma-post-attachments">
      ${attachments_html}
    </ul>
  ` : ""}

<!-- ACTIONS -->
<div class="pma-post-actions">
<div class="pma-reactions" data-post="${post.name}">
<span class="pma-reaction-btn" data-reaction="👍">
👍 <span class="count">0</span> 
</span>
<span class="pma-reaction-btn" data-reaction="❤️">
❤️ <span class="count">0</span>
</span>
<span class="pma-reaction-btn" data-reaction="🎉">
🎉 <span class="count">0</span>
</span>

</div>
<button class="pma-comment-toggle" type="button">
💬 <span class="pma-comment-count">${post.comment_count || 0}</span>
</button>

</div>
<!-- COMMENTS CONTAINER (HIDDEN BY DEFAULT) -->
<div class="pma-comments-container" style="display:none;">
<div class="pma-comments-list" data-post="${post.name}"></div>
</div>
</div>
`);

$card.find(".pma-post-content").html(post.content || "");


frappe.call({
method: "pma_gameplan.api.get_reaction_summary",
args: { post: post.name },
callback(r) {
const data = r.message || {};
Object.entries(data).forEach(([emoji, count]) => {
$card
.find(`.pma-reaction-btn[data-reaction="${emoji}"] .count`)
.text(count);
});
}
});

// load comments under post
frappe.call({
method: "pma_gameplan.api.get_comments",
args: { post: post.name },
callback(r) {
const list = $card.find(".pma-comments-list");
list.empty();

(r.message || []).forEach(c => {
list.append(render_comment(c));
});
}
});


return $card;
}

function render_space_feed(space) {
  const $view = $("#pma-view");
  $view.empty();

  $view.append(`
    <div class="pma-space-feed-header mb-3">
      <button class="btn btn-link btn-sm pma-back-to-spaces">
        ← Spaces
      </button>
      <h3 class="pma-space-title">${space}</h3>
    </div>

    ${frappe.user.has_role("Gameplan Admin") ? `
  <div class="pma-posts-toolbar mb-2">
    <button class="btn btn-primary btn-sm new-space-post">
      New Post
    </button>
  </div>
` : ``}


    <div class="pma-posts-list"></div>
  `);

  $(".pma-back-to-spaces").on("click", () => {
    render_spaces_ui($view);
  });

  $(".new-space-post").on("click", () => {
    open_new_post_dialog(space); // 👈 pass space
  });

  load_space_posts(space);
}
function load_space_posts(space) {
  frappe.call({
    method: "pma_gameplan.api.get_space_posts",
    args: { space },
    callback(r) {
      const posts = r.message || [];
      const $list = $(".pma-posts-list");

      $list.empty();

      if (!posts.length) {
        $list.append("<p class='text-muted'>No posts in this space yet.</p>");
        return;
      }

      posts.forEach(p => {
        $list.append(render_post_card(p));
      });
    }
  });
}




/* ================= POST INTERACTIONS ================= */

/*---------------------space card-----------------*/
$(document).on("click", ".pma-space-card", function () {
const space = $(this).data("space");
render_space_feed(space);
});


$(document).on("click", ".pma-space-menu-btn", function (e) {
  e.preventDefault();
  e.stopPropagation();

  const space = $(this).data("space");
  const spaceObj = all_spaces.find(s => s.name === space);

  const items = [
    { label: "Edit", action: () => open_edit_space_dialog?.(space) },
    { label: "Mark all as read", action: () => {} },
    { label: "Join space", action: () => {} }
  ];

  const is_gameplan_admin = frappe.user.has_role("Gameplan Admin");
  const is_space_admin = Number($(this).data("is-admin")) === 1;

  if (is_gameplan_admin || is_space_admin) {

    items.push(
      { label: "Manage Members", action: () => manage_space_members(space) },

      {
        label: spaceObj?.is_archived ? "Unarchive" : "Archive",
        action: () => {
          frappe.call({
            method: "pma_gameplan.api.toggle_archive_space",
            args: {
              space,
              archive: spaceObj?.is_archived ? 0 : 1
            },
            callback: () => load_spaces()
          });
        }
      },

      { label: "Delete", class: "text-danger", action: () => delete_space(space) }
    );

  }

  show_space_menu(this, items);
});



function delete_space(space_name) {
  frappe.confirm(
    `Are you sure you want to delete this space?`,
    () => {
      frappe.call({
        method: "pma_gameplan.api.delete_space",
        args: { space: space_name },
        freeze: true,
        callback(r) {
          frappe.msgprint("Space deleted");
          // refresh UI
          load_spaces();
        }
      });
    }
  );
}



/* =====================================================
✅ FIX 1 — STOP CLICK BUBBLING AT SOURCE (ONCE ONLY)
===================================================== */
$(document).on(
"click",
".pma-reaction-btn, .pma-comment-toggle",
function (e) {
e.preventDefault();
e.stopPropagation();
}
);

/* =====================================================
✅ FIX 2 — REACTION HANDLER (MUST BE ABOVE POST CARD)
===================================================== */
$(document).on("click", ".pma-reaction-btn", function (e) {
e.preventDefault();
e.stopPropagation();

const post = $(this).closest(".pma-post-card").data("post");
const reaction = $(this).data("reaction");

frappe.call({
method: "pma_gameplan.api.react_to_post",
args: { post, reaction },
callback: function () {

  const $card = $(e.target).closest(".pma-post-card");
  const post = $card.data("post");

  frappe.call({
    method: "pma_gameplan.api.get_reaction_summary",
    args: { post },
    callback(r) {
      const data = r.message || {};

      Object.entries(data).forEach(([emoji, count]) => {
        $card
          .find(`.pma-reaction-btn[data-reaction="${emoji}"] .count`)
          .text(count);
      });
    }
  });

}
});
});

/* =====================================================
TOOLTIP — REACTION USERS
===================================================== */
$(document).on("mouseenter", ".pma-reaction-btn", function () {
const $btn = $(this);
const post = $btn.closest(".pma-post-card").data("post");
const reaction = $btn.data("reaction");

frappe.call({
method: "pma_gameplan.api.get_reaction_users",
args: { post, reaction },
callback(r) {
const users = (r.message || []).map(u => u.user).join(", ");
if (users) {
$btn.attr("title", `Liked by ${users}`);
}
}
});
});

/* =====================================================
✅ FIX 3 — COMMENT TOGGLE (SAFE VERSION)
===================================================== */
$(document).on("click", ".pma-comment-toggle", function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();   // 🔥 THIS FIXES IT

    const $card = $(this).closest(".pma-post-card");
    const $comments = $card.find(".pma-comments-container");

    $(".pma-comments-container").not($comments).hide();
    $(".pma-comment-box").remove();

    $comments.toggle();

    if ($card.find(".pma-comment-box").length) return;

    const $box = $(`
        <div class="pma-comment-box mt-2">
            <textarea class="pma-comment-input"
                rows="2"
                placeholder="Write a comment..."></textarea>
            <button class="btn btn-primary btn-xs mt-2 pma-submit-comment">
                Post
            </button>
        </div>
    `);

    $comments.append($box);
});


/* ---------- SUBMIT COMMENT ---------- */
$(document).on("click", ".pma-submit-comment", function (e) {
e.preventDefault();
e.stopPropagation();

const $box = $(this).closest(".pma-comment-box");
const content = $box.find(".pma-comment-input").val();

const post = $(this)
.closest(".pma-post-card")
.data("post");

if (!content) return;

frappe.call({
method: "pma_gameplan.api.add_comment",
args: {
post,
content
},
callback: function () {

  const $card = $(e.target).closest(".pma-post-card");
  const post = $card.data("post");

  // Reload only comments for this card
  frappe.call({
    method: "pma_gameplan.api.get_comments",
    args: { post },
    callback(r) {

      const list = $card.find(".pma-comments-list");
      list.empty();

      (r.message || []).forEach(c => {
        list.append(render_comment(c));
      });

      // Update comment count
      const count = r.message.length;
      $card.find(".pma-comment-count").text(count);
    }
  });

}

});
});


/* =====================================================
REPLY BUTTON
===================================================== */
$(document).on("click", ".pma-reply-btn", function (e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();   // 🔥 critical

$(".pma-reply-box").remove();

const $comment = $(this).closest(".pma-comment");

const $box = $(`
<div class="pma-reply-box mt-2">
<textarea class="pma-reply-input"
rows="2"
placeholder="Reply... (@mention supported)"></textarea>
<button class="btn btn-primary btn-xs mt-1 pma-submit-reply">
Reply
</button>
</div>
`);

$comment.append($box);
});

/* =====================================================
SUBMIT REPLY
===================================================== */
$(document).on("click", ".pma-submit-reply", function (e) {
e.preventDefault();
e.stopPropagation();

const content = $(this)
.closest(".pma-reply-box")
.find(".pma-reply-input")
.val();

const parent_comment = $(this)
.closest(".pma-comment")
.data("comment");

const post = $(this)
.closest(".pma-post-card")
.data("post");

if (!content) return;

frappe.call({
method: "pma_gameplan.api.add_comment",
args: { post, content, parent_comment },
callback: function () {

  const $card = $(e.target).closest(".pma-post-card");
  const post = $card.data("post");

  frappe.call({
    method: "pma_gameplan.api.get_reaction_summary",
    args: { post },
    callback(r) {
      const data = r.message || {};

      Object.entries(data).forEach(([emoji, count]) => {
        $card
          .find(`.pma-reaction-btn[data-reaction="${emoji}"] .count`)
          .text(count);
      });
    }
  });

}

});
});

/* =====================================================
POST CARD CLICK — ADMIN EDIT (LAST, ALWAYS LAST)
===================================================== */
/* ---------- ALLOW LINK CLICKS INSIDE POSTS ---------- */
$(document).on("click", ".pma-post-main", function () {

    if (!frappe.user.has_role("Gameplan Admin")) return;

    const post = $(this).closest(".pma-post-card").data("post");

    open_edit_post_dialog(post);
});



window.open_new_post_dialog = open_new_post_dialog;

