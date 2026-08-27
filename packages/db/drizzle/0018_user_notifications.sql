create table "notification_preferences" (
  "user_id" integer primary key not null,
  "subscription_events" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "notification_preferences_user_id_users_id_fk"
    foreign key ("user_id") references "public"."users"("id")
    on delete cascade on update no action
);
--> statement-breakpoint
create table "user_notifications" (
  "id" serial primary key not null,
  "user_id" integer not null,
  "kind" text not null,
  "payload" jsonb default '{}'::jsonb not null,
  "source_key" text not null,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  constraint "user_notifications_user_id_users_id_fk"
    foreign key ("user_id") references "public"."users"("id")
    on delete cascade on update no action,
  constraint "user_notifications_kind_check"
    check ("kind" in ('subscription_purchase', 'subscription_renew'))
);
--> statement-breakpoint
create unique index "user_notifications_source_unique"
  on "user_notifications" ("source_key");
--> statement-breakpoint
create index "user_notifications_user_created_idx"
  on "user_notifications" ("user_id", "created_at", "id");
--> statement-breakpoint
create index "user_notifications_user_unread_idx"
  on "user_notifications" ("user_id", "created_at", "id")
  where "read_at" is null;
