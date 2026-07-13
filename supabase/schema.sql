-- Dashboard Pekerjaan Tim Education — schema Supabase
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor > New query > Run

create extension if not exists "pgcrypto";

create table if not exists members (
  id serial primary key,
  name text unique not null,
  accent text not null,
  sort_order int not null
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  member_name text not null references members(name) on delete cascade,
  body text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: dibuka untuk anon key (tanpa login), sesuai untuk tim kecil internal.
-- Siapa pun yang punya link dashboard bisa baca/tulis. Jangan sebar link publik jika ini jadi masalah.
alter table members enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;

create policy "public read members" on members for select using (true);

create policy "public read tasks" on tasks for select using (true);
create policy "public insert tasks" on tasks for insert with check (true);
create policy "public update tasks" on tasks for update using (true);
create policy "public delete tasks" on tasks for delete using (true);

create policy "public read comments" on task_comments for select using (true);
create policy "public insert comments" on task_comments for insert with check (true);
create policy "public delete comments" on task_comments for delete using (true);

-- Realtime: supaya perubahan tugas & komentar muncul live di semua browser yang sedang membuka dashboard
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table task_comments;

-- Seed anggota tim
insert into members (name, accent, sort_order) values
  ('Sharah', 'rose', 1),
  ('Raras', 'peach', 2),
  ('Elyska', 'yellow', 3),
  ('Syika', 'mint', 4),
  ('Wulan', 'blue', 5),
  ('Tasya', 'lavender', 6)
on conflict (name) do nothing;

-- Seed pekerjaan awal (Juni 2026)
insert into tasks (member_name, body) values
  ('Sharah', 'Follow up IBO for HBC school code'),
  ('Sharah', 'Registering HoS HBC Cat 1'),
  ('Sharah', 'Follow up recruitment and English enrichment HBC'),
  ('Sharah', 'Get ready for NSEI distribution'),
  ('Sharah', 'Processing Parent Academy feedback'),
  ('Sharah', 'Prepare material guideline and contact potential speakers for Parent Webinar 2nd edition'),
  ('Sharah', 'Prepare detail International Curriculum Preparation module (SNT module as well)'),
  ('Sharah', 'Prepare and coordinate Generation Global workshop'),

  ('Raras', 'Signing Perjanjian Kerja Matauli : Juan, Rido, dan Yulinar'),
  ('Raras', 'Signing Perjajn Kerja KTB: Rantau, Ahmad, Munalim, Joko, Aulia'),
  ('Raras', 'Offering kandidat (termasuk reference check dan initial documents): Librarian, Konselor, Driver, CCA Admin, Finance & HR Admin'),
  ('Raras', 'Rejection letter gelombang kandidat akhir'),
  ('Raras', 'Pendaftaran BPJS dan BPJSTK karyawan baru & update payroll ke finance'),
  ('Raras', 'Perbaikan Database employee'),
  ('Raras', 'Follow up hubungan industrial Pak Ulung'),
  ('Raras', 'Perpanjangan kontrak Rio, Yoga, dan Rizky Juventus'),

  ('Elyska', 'Assisting distribution of the uniform at KTB'),
  ('Elyska', 'Finishing uniform handbook for next year production process'),
  ('Elyska', 'Following up uniforms that will be shipped to KTB this week'),
  ('Elyska', 'Coordinating with finance regarding sewing allowance (need to transfer the allowance to KTB GA team)'),
  ('Elyska', 'Following up on returned fabric to vendor and sending it back to convection'),

  ('Syika', 'Assisting the installation of Mosyle to all laptops at KTB (macbook Neo will start the installation this week on 15 and 16, will send formal email to school leaders about this)'),
  ('Syika', 'Developing NSTPrep website mockup'),
  ('Syika', 'Prep for laptop distribution at KTB'),
  ('Syika', 'Reminding GDA for Google Plus new licenses and existing ones (deadline on July 27th) and MDM extension'),
  ('Syika', 'Coordinating with Pak Rio for digital infrastructure readiness at KTB'),

  ('Wulan', 'Arrange paket soal NST Prediction 1, NST Practice 1-3'),
  ('Wulan', 'Mirroring paket soal dengan AI supaya tidak sama persis'),
  ('Wulan', 'Follow Up keputusan penawaran Algobash ke mas Aqsa'),
  ('Wulan', 'Koordinasi dengan tim marketing untuk desain logo & coming soon'),
  ('Wulan', 'Follow Up penawaran 1Engage untuk WABA (perlu WA CS NST terpisah dengan SPMB)'),

  ('Tasya', 'Merespons setiap pertanyaan yang masuk ke WhatsApp dan email Customer Service.'),
  ('Tasya', 'Mengirimkan blast WhatsApp rekaman dan materi webinar Parents Academy: Supporting Your Child''s Path to University.'),
  ('Tasya', 'Menyusun Terms of Reference (TOR) untuk kegiatan bersama 20 Universitas Terbaik di Indonesia dan Boarding Life Training.'),
  ('Tasya', 'Membuat database nomor telepon calon pendaftar yang berminat mengikuti SPMB SMA KTB untuk keperluan blast promosi NST.'),
  ('Tasya', 'Mencari ide konten promosi NST.');
