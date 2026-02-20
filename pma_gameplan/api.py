import frappe
from frappe.utils import now_datetime

from pma_gameplan.constants import (
    GAMEPLAN_MEMBER_ROLE,
    GAMEPLAN_ADMIN_ROLE
)
ALLOWED_EMAIL_DOMAINS = ["prettl.com"]

# ---------------- POSTS ----------------

import frappe
@frappe.whitelist()
def get_posts(filter="all", sort="newest", limit=20):
    filters = {}

    if filter == "bookmarked":
        filters["is_bookmarked"] = 1

    order_by = "published_on desc"
    if sort == "oldest":
        order_by = "published_on asc"
    elif sort == "created":
        order_by = "creation desc"

    posts = frappe.get_all(
        "PMA Post",
        filters=filters,
        fields=[
            "name",
            "title",
            "content",
            "post_type",
            "author",
            "published_on"
        ],
        order_by=order_by,
        limit=limit
    )

    for p in posts:
        p.attachments = frappe.get_all(
            "PMA Post Attachment",
            filters={
                "parent": p.name,
                "parenttype": "PMA Post"
            },
            fields=["file", "file_name", "file_type"]
        )

        try:
            user_doc = frappe.get_cached_doc("User", p.author)
            p.author_name = (
                user_doc.full_name
                or user_doc.first_name
                or p.author
            )
        except frappe.DoesNotExistError:
            p.author_name = p.author

        p.comment_count = frappe.db.count(
            "PMA Post Comment",
            {"post": p.name}
        )

    return posts



@frappe.whitelist()
def get_branch_spaces():
    return frappe.get_all(
        "PMA Space",
        filters={"space_type": "Branch"},
        fields=["name", "space_name"]
    )

@frappe.whitelist()
def create_post(title, content, post_type="Post", space=None, attachments=None):

    # 🔐 ADMIN ONLY
    if "Gameplan Admin" not in frappe.get_roles():
        frappe.throw("Only Gameplan Admin can create posts")

    post = frappe.new_doc("PMA Post")
    post.title = title
    post.content = content
    post.post_type = post_type
    post.author = frappe.session.user
    post.published_on = now_datetime()

    if space:
        post.space = space

    if attachments:
        if isinstance(attachments, str):
            attachments = frappe.parse_json(attachments)

        for f in attachments:
            post.append("attachments", {
                "file": f.get("file"),
                "file_name": f.get("file_name"),
                "file_type": f.get("file_type")
            })

    post.insert(ignore_permissions=True)
    return post.name



@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_postable_spaces_link(doctype, txt, searchfield, start, page_len, filters):
    return frappe.db.sql("""
        SELECT name, space_name
        FROM `tabPMA Space`
        WHERE space_name LIKE %(txt)s
        ORDER BY space_name
        LIMIT %(start)s, %(page_len)s
    """, {
        "txt": f"%{txt}%",
        "start": start,
        "page_len": page_len
    })



@frappe.whitelist()
def get_post(name):
    post = frappe.get_doc("PMA Post", name)
    return {
        "name": post.name,
        "title": post.title,
        "content": post.content,
        "post_type": post.post_type,
        "attachments": post.attachments

    }


@frappe.whitelist()
def update_post(name, title, content, post_type):
    if GAMEPLAN_ADMIN_ROLE not in frappe.get_roles():
        frappe.throw(_("Not permitted"))

    post = frappe.get_doc("PMA Post", name)
    post.title = title
    post.content = content
    post.post_type = post_type

    # allow save because role already validated
    post.save(ignore_permissions=True)
    return True


@frappe.whitelist()
def delete_post(name):
    if GAMEPLAN_ADMIN_ROLE not in frappe.get_roles():
        frappe.throw(_("Not permitted"), frappe.PermissionError)

    # delete linked reactions
    reactions = frappe.get_all(
        "PMA Post Reaction",
        filters={"post": name},
        pluck="name"
    )

    for r in reactions:
        frappe.delete_doc(
            "PMA Post Reaction",
            r,
            ignore_permissions=True,
            force=True
        )

    # now delete the post
    frappe.delete_doc(
        "PMA Post",
        name,
        ignore_permissions=True,
        force=True
    )

    return True

import frappe
from frappe import _
from frappe import publish_realtime

@frappe.whitelist()
def react_to_post(post, reaction):

    user = frappe.session.user
    roles = frappe.get_roles(user)

    post_doc = frappe.get_doc("PMA Post", post)
    space = post_doc.space

    # 🔓 Admin override
    if "Gameplan Admin" not in roles:

        member = frappe.db.get_value(
            "PMA Member",
            {"user": user},
            "name"
        )

        if not member:
            frappe.throw("Not a PMA Member")

        is_member = frappe.db.exists(
            "PMA Space Member",
            {
                "parent": space,
                "member": member
            }
        )

        if not is_member:
            frappe.throw("Not allowed to react in this space")

    # ✅ Existing logic
    existing = frappe.db.get_value(
        "PMA Post Reaction",
        {"post": post, "reaction": reaction, "user": user},
        "name"
    )

    if existing:
        frappe.delete_doc("PMA Post Reaction", existing, ignore_permissions=True)
        action = "removed"
    else:
        frappe.get_doc({
            "doctype": "PMA Post Reaction",
            "post": post,
            "reaction": reaction,
            "user": user
        }).insert(ignore_permissions=True)
        action = "added"

    return {"status": action}



@frappe.whitelist()
def get_reaction_summary(post):
    rows = frappe.db.sql(
        """
        SELECT reaction, COUNT(*) as count
        FROM `tabPMA Post Reaction`
        WHERE post = %s
        GROUP BY reaction
        """,
        post,
        as_dict=True
    )

    return {r.reaction: r.count for r in rows}


@frappe.whitelist()
def get_reaction_users(post, reaction):
    return frappe.get_all(
        "PMA Post Reaction",
        filters={"post": post, "reaction": reaction},
        fields=["user"]
    )



@frappe.whitelist()
def add_comment(post, content, parent_comment=None):

    user = frappe.session.user
    roles = frappe.get_roles(user)

    post_doc = frappe.get_doc("PMA Post", post)
    space = post_doc.space

    # 🔓 Admin override
    if "Gameplan Admin" not in roles:

        member = frappe.db.get_value(
            "PMA Member",
            {"user": user},
            "name"
        )

        if not member:
            frappe.throw("Not a PMA Member")

        is_member = frappe.db.exists(
            "PMA Space Member",
            {
                "parent": space,
                "member": member
            }
        )

        if not is_member:
            frappe.throw("Not allowed to comment in this space")

    # ✅ Create comment
    doc = frappe.new_doc("PMA Post Comment")
    doc.post = post
    doc.content = content
    doc.parent_comment = parent_comment
    doc.author = user
    doc.insert(ignore_permissions=True)

    return doc.name



@frappe.whitelist()
def delete_comment(name):
    doc = frappe.get_doc("PMA Post Comment", name)

    # Permission check
    if doc.author != frappe.session.user and not frappe.has_role("Gameplan Admin"):
        frappe.throw("Not permitted")

    # 🔥 Recursive delete of this comment branch
    delete_comment_branch(name)

    return True


def delete_comment_branch(comment_name):
    # Find direct children
    children = frappe.get_all(
        "PMA Post Comment",
        filters={"parent_comment": comment_name},
        pluck="name"
    )

    # Recursively delete children first
    for child in children:
        delete_comment_branch(child)

    # Then delete current comment
    frappe.delete_doc(
        "PMA Post Comment",
        comment_name,
        ignore_permissions=True
    )



@frappe.whitelist()
def update_comment(name, content):
    doc = frappe.get_doc("PMA Post Comment", name)

    if doc.author != frappe.session.user and not frappe.has_role("Gameplan Admin"):
        frappe.throw("Not permitted")

    doc.content = content
    doc.save()
    return True




from frappe.utils import get_fullname

@frappe.whitelist()
def get_comments(post):
    comments = frappe.get_all(
        "PMA Post Comment",
        filters={"post": post},
        fields=[
            "name",
            "content",
            "parent_comment",
            "author",
            "creation"
        ],
        order_by="creation asc"
    )

    # Build map
    comment_map = {}
    for c in comments:
        c["replies"] = []
        c["author_name"] = frappe.get_value("User", c["author"], "full_name") or c["author"]
        comment_map[c["name"]] = c

    roots = []

    for c in comment_map.values():
        if c["parent_comment"]:
            parent = comment_map.get(c["parent_comment"])
            if parent:
                parent["replies"].append(c)
        else:
            roots.append(c)

    return roots


# ---------------- PEOPLE ----------------

from pma_gameplan.constants import GAMEPLAN_ADMIN_ROLE


@frappe.whitelist()
def get_people():
    return frappe.get_all(
        "PMA Member",
        filters={"status": "Active"},
        fields=[
            "name",
            "user",          # ✅ REQUIRED
            "full_name",
            "email",
            "company",
            "status"
        ],
        order_by="full_name asc"
    )


@frappe.whitelist()
def get_people():
    return frappe.db.sql("""
        SELECT
            u.name,
            u.email,
            u.full_name
        FROM `tabUser` u
        JOIN `tabHas Role` r ON r.parent = u.name
        WHERE u.enabled = 1
          AND r.role IN (%s, %s)
        GROUP BY u.name
        ORDER BY u.full_name
    """, (
        GAMEPLAN_MEMBER_ROLE,
        GAMEPLAN_ADMIN_ROLE
    ), as_dict=True)


@frappe.whitelist()
def get_member(name):
    return frappe.get_doc("PMA Member", name)

from pma_gameplan.constants import (
    GAMEPLAN_MEMBER_ROLE,
    GAMEPLAN_ADMIN_ROLE
)

@frappe.whitelist()
def invite_member(email, role):

    if role not in ["Gameplan Admin", "Gameplan Member"]:
        frappe.throw("Invalid role")

    # Create user if not exists
    if not frappe.db.exists("User", email):
        user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": email.split("@")[0],
            "enabled": 1,
            "send_welcome_email": 1
        })
        user.insert(ignore_permissions=True)
    else:
        user = frappe.get_doc("User", email)

    # Ensure System User
    user.add_roles("System User")

    # Assign selected role
    user.add_roles(role)

    user.save(ignore_permissions=True)

    return {"user": user.name}


# -------------------- PMA Space ---------------------

from pma_gameplan.constants import GAMEPLAN_ADMIN_ROLE

@frappe.whitelist()
def create_space(space_name, space_type, is_private=0):
    space_name = space_name.strip()

    if not space_name:
        frappe.throw("Space name is required")

    if GAMEPLAN_ADMIN_ROLE not in frappe.get_roles(frappe.session.user):
        frappe.throw("Only Gameplan Admins can create spaces")

    if frappe.db.exists("PMA Space", {"space_name": space_name}):
        frappe.throw(f"Space '{space_name}' already exists")

    member = frappe.db.get_value(
        "PMA Member",
        {"user": frappe.session.user},
        "name"
    )

    if not member:
        frappe.throw("You are not a Gameplan member")

    space = frappe.new_doc("PMA Space")
    space.space_name = space_name
    space.space_type = space_type
    space.is_private = is_private

    space.country = (
        frappe.defaults.get_user_default("Country")
        or frappe.db.get_single_value("Global Defaults", "country")
        or "India"
    )

    space.append("members", {
        "member": member,
        "role": "Admin"
    })

    space.insert(ignore_permissions=True)
    return space.name

@frappe.whitelist()
def get_spaces(filter_type="public"):

    user = frappe.session.user
    roles = frappe.get_roles(user)

    member = frappe.db.get_value(
        "PMA Member",
        {"user": user},
        "name"
    )

    # ---------------- PUBLIC ----------------
    if filter_type == "public":
        return frappe.get_all(
            "PMA Space",
            filters={
                "is_private": 0,
                "is_archived": 0
            },
            fields=["name", "space_name", "is_private", "is_archived"]
        )

    # ---------------- PRIVATE ----------------
    if filter_type == "private":

        # Admin → see all private (not archived)
        if "Gameplan Admin" in roles:
            return frappe.get_all(
                "PMA Space",
                filters={
                    "is_private": 1,
                    "is_archived": 0
                },
                fields=["name", "space_name", "is_private", "is_archived"]
            )

        # Member → only joined private (not archived)
        if not member:
            return []

        space_names = frappe.db.get_all(
            "PMA Space Member",
            filters={"member": member},
            pluck="parent"
        )

        if not space_names:
            return []

        return frappe.get_all(
            "PMA Space",
            filters={
                "name": ["in", space_names],
                "is_private": 1,
                "is_archived": 0
            },
            fields=["name", "space_name", "is_private", "is_archived"]
        )

    # ---------------- ARCHIVED ----------------
    if filter_type == "archived":
        return frappe.get_all(
            "PMA Space",
            filters={"is_archived": 1},
            fields=["name", "space_name", "is_private", "is_archived"]
        )

    return []



@frappe.whitelist()
def delete_space(space):
    roles = frappe.get_roles(frappe.session.user)

    # ✅ Global override
    if GAMEPLAN_ADMIN_ROLE in roles:
        frappe.delete_doc(
            "PMA Space",
            space,
            ignore_permissions=True,
            force=True
        )
        return True

    # ⬇️ Space-level fallback
    member = frappe.db.get_value(
        "PMA Member",
        {"user": frappe.session.user},
        "name"
    )

    if not member:
        frappe.throw("Not a Gameplan member")

    doc = frappe.get_doc("PMA Space", space)

    is_space_admin = any(
        m.member == member and m.role == "Admin"
        for m in doc.members
    )

    if not is_space_admin:
        frappe.throw("Only Space Admins can delete this space")

    frappe.delete_doc(
        "PMA Space",
        space,
        ignore_permissions=True,
        force=True
    )

    return True


@frappe.whitelist()
def get_my_spaces():
    user = frappe.session.user
    roles = frappe.get_roles(user)

    # 🔥 Global override — Gameplan Admin sees all spaces
    if GAMEPLAN_ADMIN_ROLE in roles:
        return frappe.get_all(
            "PMA Space",
            fields=[
                "name",
                "space_name",
                "space_type",
                "is_private"
            ],
            order_by="creation desc"
        )

    # ⬇️ Normal member logic
    member = frappe.db.get_value(
        "PMA Member",
        {"user": user},
        "name"
    )

    if not member:
        return []

    spaces = frappe.db.sql("""
        SELECT
            s.name,
            s.space_name,
            s.space_type,
            s.is_private,
            IF(sm.member IS NULL, 0, 1) AS is_member,
            IF(sm.role = 'Admin', 1, 0) AS is_admin
        FROM `tabPMA Space` s
        LEFT JOIN `tabPMA Space Member` sm
            ON sm.parent = s.name
           AND sm.member = %s
        WHERE s.is_private = 0
           OR sm.member IS NOT NULL
        ORDER BY s.creation DESC
    """, member, as_dict=True)

    return spaces

@frappe.whitelist()
def toggle_archive_space(space, archive=1):
    doc = frappe.get_doc("PMA Space", space)

    if GAMEPLAN_ADMIN_ROLE not in frappe.get_roles():
        frappe.throw("Not permitted")

    doc.is_archived = int(archive)
    doc.save(ignore_permissions=True)

    return True


@frappe.whitelist()
def add_space_member(space, user, role="Member"):
    doc = frappe.get_doc("PMA Space", space)

    roles = frappe.get_roles(frappe.session.user)

    # 🔥 Global override
    if GAMEPLAN_ADMIN_ROLE not in roles:
        current_member = frappe.db.get_value(
            "PMA Member",
            {"user": frappe.session.user},
            "name"
        )

        if not current_member:
            frappe.throw("Not a Gameplan member")

        is_space_admin = any(
            m.member == current_member and m.role == "Admin"
            for m in doc.members
        )

        if not is_space_admin:
            frappe.throw("Only Space Admins can manage members")

    # Prevent duplicate
    if any(m.member == user for m in doc.members):
        frappe.throw("Member already exists in this space")

    doc.append("members", {
        "member": user,
        "role": role
    })

    doc.save(ignore_permissions=True)
    return True




@frappe.whitelist()
def get_space_posts(space, limit=20):

    user = frappe.session.user
    roles = frappe.get_roles(user)

    # 🔐 Access validation (keep your existing membership check here)

    posts = frappe.get_all(
        "PMA Post",
        filters={"space": space},
        fields=[
            "name",
            "title",
            "content",
            "post_type",
            "author",
            "published_on"
        ],
        order_by="published_on desc",
        limit=limit
    )

    for p in posts:

        # Attachments
        p.attachments = frappe.get_all(
            "PMA Post Attachment",
            filters={
                "parent": p.name,
                "parenttype": "PMA Post"
            },
            fields=["file", "file_name", "file_type"]
        )

        # Author full name
        try:
            user_doc = frappe.get_cached_doc("User", p.author)
            p.author_name = (
                user_doc.full_name
                or user_doc.first_name
                or p.author
            )
        except frappe.DoesNotExistError:
            p.author_name = p.author

        # Comment count
        p.comment_count = frappe.db.count(
            "PMA Post Comment",
            {"post": p.name}
        )

    return posts


@frappe.whitelist()
def get_space_members(space):
    return frappe.db.sql("""
        SELECT
            sm.name,
            sm.member,
            sm.role,
            pm.full_name,
            pm.email
        FROM `tabPMA Space Member` sm
        JOIN `tabPMA Member` pm ON pm.name = sm.member
        WHERE sm.parent = %s
        ORDER BY sm.role DESC, pm.full_name
    """, space, as_dict=True)

@frappe.whitelist()
def remove_space_member(space, member):
    doc = frappe.get_doc("PMA Space", space)

    roles = frappe.get_roles(frappe.session.user)

    # 🔥 Global override
    if GAMEPLAN_ADMIN_ROLE not in roles:
        current_member = frappe.db.get_value(
            "PMA Member",
            {"user": frappe.session.user},
            "name"
        )

        if not any(
            m.member == current_member and m.role == "Admin"
            for m in doc.members
        ):
            frappe.throw("Only Space Admins can manage members")

    for m in doc.members:
        if m.member == member:
            doc.remove(m)
            doc.save(ignore_permissions=True)
            return True

    frappe.throw("Member not found")



@frappe.whitelist(allow_guest=True)
def register_pma_member(**data):
    email = (data.get("email") or "").lower().strip()

    if "@" not in email:
        frappe.throw("Invalid email")

    domain = email.split("@")[-1]
    if domain not in ALLOWED_EMAIL_DOMAINS:
        frappe.throw("Company email only")

    if frappe.db.exists("User", email):
        frappe.throw("User already exists")

    # --------------------
    # Create User
    # --------------------
    user = frappe.get_doc({
        "doctype": "User",
        "email": email,
        "first_name": data.get("first_name"),
        "last_name": data.get("last_name"),
        "enabled": 1,
        "new_password": data.get("password")
    })
    user.insert(ignore_permissions=True)

    # REQUIRED base role
    user.add_roles("System User")

    # Gameplan role
    role = GAMEPLAN_MEMBER_ROLE
    if email.endswith("@prettl.com"):
        role = GAMEPLAN_ADMIN_ROLE

    user.add_roles(role)

    # --------------------
    # Create PMA Member (profile)
    # --------------------
    if not frappe.db.exists("PMA Member", {"user": user.name}):
        frappe.get_doc({
            "doctype": "PMA Member",
            "user": user.name,
            "full_name": user.full_name,
            "email": user.email,
            "gender": data.get("gender"),
            "mobile": f"{data.get('country_code')} {data.get('mobile')}",
            "reporting_manager": data.get("reporting_manager"),
            "country": data.get("country"),
            "employment_type": data.get("employment_type"),
            "status": "Active"
        }).insert(ignore_permissions=True)

    return {"status": "ok"}

@frappe.whitelist()
def get_tasks(filter_type="all"):
    user = frappe.session.user

    filters = {}

    if filter_type == "assigned":
        filters["assigned_to"] = user

    elif filter_type == "created":
        filters["created_by_member"] = user

    tasks = frappe.get_all(
        "PMA Task",
        filters=filters,
        fields=[
            "name",
            "title",
            "description",
            "assigned_to",
            "space",
            "start_date",
            "end_date",
            "progress",
            "status",
            "priority",
            "created_by_member",
            "creation"
        ],
        order_by="creation desc"
    )

    return tasks


import frappe
from frappe.utils import get_url_to_form


@frappe.whitelist()
def create_task(data):
    data = frappe.parse_json(data)
    user = frappe.session.user
    space = data.get("space")

    # Get PMA Member record
    member = frappe.db.get_value(
        "PMA Member",
        {"user": user},
        "name"
    )

    if not member:
        frappe.throw("You are not a PMA Member.")

    # Check space membership
    is_member = frappe.db.exists(
        "PMA Space Member",
        {
            "parent": space,
            "member": member
        }
    )

    if not is_member:
        frappe.throw("You are not a member of this space.")

    task = frappe.get_doc({
        "doctype": "PMA Task",
        "title": data.get("title"),
        "description": data.get("description"),
        "space": space,
        "assigned_to": data.get("assigned_to"),
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "progress": data.get("progress") or "0%",
        "status": data.get("status") or "Open",
        "priority": data.get("priority") or "Medium",
        "created_by_member": member
    })

    task.insert()

    # ✅ SEND EMAIL IF ASSIGNED
    if task.assigned_to:
        send_task_assignment_email(task)

    return task.name

def send_task_assignment_email(task):

    user_email = task.assigned_to

    if not user_email:
        return

    task_url = get_url_to_form("PMA Task", task.name)

    frappe.sendmail(
        recipients=[user_email],
        subject=f"You have been assigned a new task: {task.title}",
        message=f"""
        <p>Hello,</p>

        <p>You have been assigned a new task:</p>

        <ul>
            <li><strong>Title:</strong> {task.title}</li>
            <li><strong>Description:</strong> {task.description}<li>
            <li><strong>Priority:</strong> {task.priority}</li>
            <li><strong>Status:</strong> {task.status}</li>
            <li><strong>Start Date:</strong> {task.start_date}</li>
            <li><strong>End Date:</strong> {task.end_date}</li>
        </ul>

        <p>
            <a href="{task_url}">Click here to view the task</a>
        </p>

        <p>Regards,<br>PMA Gameplan</p>
        """
    )




@frappe.whitelist()
def update_task(name, data):
    data = frappe.parse_json(data)

    task = frappe.get_doc("PMA Task", name)

    for key in data:
        task.set(key, data.get(key))

    task.save()
    return "Updated"

@frappe.whitelist()
def update_task_field(name, field, value):

    doc = frappe.get_doc("PMA Task", name)
    doc.set(field, value)
    doc.save()

    if field == "assigned_to" and value:
        send_task_assignment_email(doc)

    return "Updated"


@frappe.whitelist()
def get_task_preview(name):

    task = frappe.get_doc("PMA Task", name)

    is_admin = "Gameplan Admin" in frappe.get_roles()

    return {
        "task": {
            "name": task.name,
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "progress": task.progress,
            "start_date": task.start_date,
            "end_date": task.end_date,
            "space": task.space,
            "assigned_to": task.assigned_to,
        },
        "is_admin": is_admin
    }




# ---------------- ROLE SYNC ----------------

from pma_gameplan.constants import (
    GAMEPLAN_MEMBER_ROLE,
    GAMEPLAN_ADMIN_ROLE
)

def sync_role(user, role):
    user_doc = frappe.get_doc("User", user)

    if role == GAMEPLAN_ADMIN_ROLE:
        user_doc.add_roles(GAMEPLAN_ADMIN_ROLE)
    else:
        user_doc.add_roles(GAMEPLAN_MEMBER_ROLE)

    user_doc.save(ignore_permissions=True)
