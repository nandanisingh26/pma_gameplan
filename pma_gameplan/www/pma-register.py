# pma-register.py

no_cache = 1

def get_context(context):
    # Hide top navbar (Home)
    context.no_header = True

    # Hide footer (Powered by ERPNext)
    context.no_footer = True

    # Optional: hide breadcrumbs if any
    context.hide_breadcrumbs = True