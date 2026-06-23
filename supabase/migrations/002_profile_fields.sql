-- Run this in Supabase SQL Editor after 001_initial_schema.sql
alter table public.profiles
  add column if not exists bio       text,
  add column if not exists location  text,
  add column if not exists job_title text;
