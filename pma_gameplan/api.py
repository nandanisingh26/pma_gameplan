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
def get_postable_spaces_link(doctype, txt, searchfield, start, page_len, filters):
    user = frappe.session.user

    member = frappe.db.get_value(
        "PMA Member",
        {"user": user},
        "name"
    )

    if not member:
        return []

    return frappe.db.sql("""
        SELECT
            s.name,
            s.space_name
        FROM `tabPMA Space` s
        JOIN `tabPMA Space Member` sm
            ON sm.parent = s.name
        WHERE
            sm.member = %s
            AND s.space_name LIKE %s
        ORDER BY s.space_name
        LIMIT %s OFFSET %s
    """, (
        member,
        f"%{txt}%",
        page_len,
        start
    ))




import frappe
from frappe.utils import now_datetime

@frappe.whitelist()
def create_post(title, content, post_type="Post", space=None, attachments=None):
    post = frappe.new_doc("PMA Post")
    post.title = title
    post.content = content
    post.post_type = post_type
    post.author = frappe.session.user
    post.published_on = now_datetime()

    # ✅ SAFE assignment
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
    if not frappe.has_role(GAMEPLAN_ADMIN_ROLE):
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




@frappe.whitelist()
def toggle_reaction(post, reaction="Like"):
    user = frappe.session.user

    existing = frappe.get_value(
        "PMA Post Reaction",
        {"post": post, "user": user},
        "name"
    )

    if existing:
        frappe.delete_doc(
            "PMA Post Reaction",
            existing,
            ignore_permissions=True
        )
        return {"status": "removed"}

    doc = frappe.new_doc("PMA Post Reaction")
    doc.post = post
    doc.user = user
    doc.reaction = reaction
    doc.insert(ignore_permissions=True)

    return {"status": "added"}




import frappe
from frappe import _
from frappe import publish_realtime

@frappe.whitelist()
def react_to_post(post, reaction):
    user = frappe.session.user

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

    publish_realtime(
        event="pma_post_reaction_update",
        message={"post": post},
        after_commit=True
    )

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
    doc = frappe.new_doc("PMA Post Comment")
    doc.post = post
    doc.content = content
    doc.parent_comment = parent_comment
    doc.author = frappe.session.user
    doc.creations = frappe.utils.now_datetime()
    doc.insert(ignore_permissions=True)

    return doc.name


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
            "creations"
        ],
        order_by="creations asc"
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

@frappe.whitelist()
def invite_member(email, role="PMA Member"):
    # 1️⃣ Resolve company safely
    company = (
        frappe.defaults.get_user_default("Company")
        or frappe.db.get_single_value("Global Defaults", "default_company")
        or frappe.db.get_value("Company", {}, "name")
    )

    if not company:
        frappe.throw("No Company found. Please create or set a default Company.")

    # 2️⃣ Create user if not exists
    if not frappe.db.exists("User", email):
        user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": email.split("@")[0],
            "enabled": 1,
            "send_welcome_email": 1
        })
        user.insert(ignore_permissions=True)

        # Assign base role only if exists
        if frappe.db.exists("Role", "System User"):
            user.add_roles("System User")
    else:
        user = frappe.get_doc("User", email)

    # 3️⃣ Create PMA Member
    if not frappe.db.exists("PMA Member", {"user": user.name}):
        member = frappe.new_doc("PMA Member")
        member.user = user.name
        member.full_name = user.full_name
        member.email = user.email
        member.company = company
        member.role = role
        member.status = "Active"
        member.insert(ignore_permissions=True)

    # 4️⃣ Sync PMA role → Frappe role
    sync_role(user.name, role)

    return {
        "user": user.name,
        "company": company
    }

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

    member = frappe.db.get_value(
    "PMA Member",
    {"user": user},
    "name"
    )
    as_dict=True



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
def add_space_member(space, user, role="Member"):
    if GAMEPLAN_ADMIN_ROLE not in frappe.get_roles(frappe.session.user):
        frappe.throw("Only Gameplan Admins can manage space members")

    doc = frappe.get_doc("PMA Space", space)

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
    return frappe.get_all(
        "PMA Post",
        filters={"space": space},
        fields=["name", "title", "content", "author", "creation"],
        order_by="creation desc",
        limit=limit
    )

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

    current_member = frappe.db.get_value(
    "PMA Member",
    {"user": frappe.session.user},
    "name")
    as_dict=True



    if not any(m.member == current_member and m.role == "Admin" for m in doc.members):
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



