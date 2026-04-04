# Sozialplaner

Persönlicher Social-Planer: Freunde verwalten, Aktivitäten vorschlagen, Treffen planen und tracken.

## Stack

| Schicht | Technologie |
|---|---|
| Frontend | HTML, CSS, JavaScript ES Modules (kein Build-Step) |
| Auth | Supabase Auth (Email/Passwort) |
| Datenbank | Supabase PostgreSQL + Row Level Security |
| Hosting | GitHub Pages |

## Struktur

```
js/
├── app.js               Hash-Router, Auth-State, globale Event-Handler
├── auth.js              signIn, signUp, signOut, getCurrentUser, onAuthStateChange
├── state.js             Reaktiver zentraler State — getState / setState / subscribe
├── supabase-client.js   Supabase-Instanz (URL + anon key)
│
├── store/               Datenbankzugriff (Supabase CRUD)
│   ├── friends.js       getFriends, addFriend, updateFriend, deleteFriend
│   ├── activities.js    getActivities, addActivity, updateActivity, deleteActivity
│   ├── events.js        getEvents, addEvent, updateEvent, deleteEvent
│   └── index.js         Re-exportiert alle Store-Funktionen
│
├── ui/                  Wiederverwendbare UI-Logik
│   ├── helpers.js       Render-Hilfsfunktionen, XSS-Escaping, scoreFriend-Algorithmus
│   ├── feedback.js      showToast, showLoading, showEmpty
│   └── cal-modal.js     Kalender-Modal (openCalModal, saveCalEvent, exportICS, …)
│
└── views/               Seitenmodule — render(container, mode) + setMode + cleanup
    ├── login.js         Login-Formular
    ├── dashboard.js     Übersicht (#/) und Vorschlag (#/suggest)
    ├── friends.js       Freunde-Liste (#/friends)
    ├── activities.js    Aktivitäten-Liste (#/activities)
    └── events.js        Kalender (#/events) und Verlauf (#/log)
```

## Datenfluss

```
User-Aktion
  → View (Event-Delegation, data-action)
    → Store (Supabase-Aufruf)
      → setState (zentraler State aktualisiert)
        → subscribe-Callbacks feuern
          → Views re-rendern sich
```

## Setup

### 1. Supabase-Projekt anlegen

1. Projekt auf [supabase.com](https://supabase.com) erstellen
2. In `js/supabase-client.js` eintragen:
   ```js
   const SUPABASE_URL = 'https://<dein-projekt>.supabase.co';
   const SUPABASE_ANON_KEY = '<dein-anon-key>';
   ```

### 2. Tabellen anlegen

```sql
-- friends
create table friends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users not null,
  name text not null,
  birthday date,
  city text,
  category text default 'friend',
  partner text default 'solo',
  days jsonb default '[]',
  notes text,
  last_seen date
);

-- activities
create table activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users not null,
  name text not null,
  location text,
  budget numeric,
  energy text default 'medium',
  min integer default 1,
  max integer default 99,
  duration numeric,
  mode text default 'social',
  inout text default 'indoor',
  tags jsonb default '[]',
  todos text
);

-- events
create table events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  owner_id uuid references auth.users not null,
  date date not null,
  time text,
  "activityId" uuid,
  "activityName" text,
  "peopleIds" jsonb default '[]',
  people text,
  note text,
  done boolean default false,
  mode text default 'social'
);
```

### 3. Row Level Security aktivieren

```sql
-- Für alle drei Tabellen:
alter table friends enable row level security;
alter table activities enable row level security;
alter table events enable row level security;

-- friends & activities: eigene Zeilen lesen/schreiben
create policy "own rows" on friends for all using (auth.uid() = user_id);
create policy "own rows" on activities for all using (auth.uid() = user_id);

-- events: owner
create policy "own rows" on events for all using (auth.uid() = owner_id);
```

### 4. Auf GitHub Pages deployen

Repository muss `index.html` im Root haben. Unter **Settings → Pages** Branch `main` auswählen — fertig.
