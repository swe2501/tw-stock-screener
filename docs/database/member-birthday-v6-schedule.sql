-- Approved cloud-only automatic birthday award. UTC hourly :05 = Taipei :05.
-- Retry is idempotent by account/year. No model, email, SMS, or paid external API.
begin;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('member-birthday-v6','5 * * * *','select public._member_birthday_run_v6();');
select public._member_birthday_run_v6();
commit;
