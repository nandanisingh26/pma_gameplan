FROM frappe/frappe-worker:latest

USER root

# Copy custom app into apps folder
COPY pma_gameplan /home/frappe/frappe-bench/apps/pma_gameplan

RUN chown -R frappe:frappe /home/frappe/frappe-bench/apps/pma_gameplan

USER frappe
