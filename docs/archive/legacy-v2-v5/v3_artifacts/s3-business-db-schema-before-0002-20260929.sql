--
-- PostgreSQL database dump
--

-- Dumped from database version 17.4 (Homebrew)
-- Dumped by pg_dump version 17.4 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: event_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_participants (
    id integer NOT NULL,
    event_id character varying(64),
    slot smallint NOT NULL,
    player_id character varying(64),
    nickname character varying(64) NOT NULL,
    rank_score integer DEFAULT 10000,
    odds numeric(6,2) DEFAULT 5.00,
    support_count integer DEFAULT 0,
    final_rank smallint NOT NULL,
    commander character varying(32) DEFAULT '通用'::character varying,
    lineup character varying(64) DEFAULT '常规'::character varying,
    CONSTRAINT event_participants_final_rank_check CHECK (((final_rank >= 1) AND (final_rank <= 6))),
    CONSTRAINT event_participants_slot_check CHECK (((slot >= 1) AND (slot <= 6)))
);


--
-- Name: event_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.event_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: event_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.event_participants_id_seq OWNED BY public.event_participants.id;


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id character varying(64) NOT NULL,
    mode character varying(32) DEFAULT 'RANKED_DIAMOND'::character varying,
    scheduled_at timestamp with time zone NOT NULL,
    title character varying(128) NOT NULL,
    status character varying(32) DEFAULT 'AUDITED'::character varying,
    evidence_id character varying(64),
    verified_at timestamp with time zone,
    verified_by character varying(64),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: evidences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidences (
    id character varying(64) NOT NULL,
    sha256 character varying(64) NOT NULL,
    source_id character varying(64) NOT NULL,
    captured_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    verified_by character varying(64),
    status character varying(32) DEFAULT 'VERIFIED'::character varying,
    note text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_batches (
    batch_id character varying(64) NOT NULL,
    source character varying(64) DEFAULT 'MANUAL_IMPORT'::character varying,
    total_records integer NOT NULL,
    inserted integer NOT NULL,
    updated integer DEFAULT 0,
    duplicates integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: lineup_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lineup_snapshots (
    id character varying(64) NOT NULL,
    source_id character varying(64) NOT NULL,
    lineup_name character varying(64) NOT NULL,
    tier character varying(16) DEFAULT 'T1'::character varying,
    commander character varying(32) DEFAULT '通用'::character varying,
    core_heroes jsonb DEFAULT '[]'::jsonb,
    sample_count integer NOT NULL,
    win_rate numeric(5,4) NOT NULL,
    top3_rate numeric(5,4) NOT NULL,
    avg_rank numeric(4,2) NOT NULL,
    snapshot_version character varying(32) DEFAULT 'v2609'::character varying,
    window_text character varying(64) DEFAULT '近 7 日实战聚合'::character varying,
    scope character varying(64) DEFAULT '全服王者段位'::character varying,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lineup_snapshots_avg_rank_check CHECK (((avg_rank >= (1)::numeric) AND (avg_rank <= (6)::numeric))),
    CONSTRAINT lineup_snapshots_sample_count_check CHECK ((sample_count >= 0)),
    CONSTRAINT lineup_snapshots_top3_rate_check CHECK (((top3_rate >= (0)::numeric) AND (top3_rate <= (1)::numeric))),
    CONSTRAINT lineup_snapshots_win_rate_check CHECK (((win_rate >= (0)::numeric) AND (win_rate <= (1)::numeric)))
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id character varying(64) NOT NULL,
    player_id character varying(64),
    match_time timestamp with time zone NOT NULL,
    available_at timestamp with time zone NOT NULL,
    mode character varying(32) DEFAULT 'RANKED_DIAMOND'::character varying,
    final_rank smallint NOT NULL,
    commander character varying(32) DEFAULT '通用'::character varying,
    lineup character varying(64) DEFAULT '未识别'::character varying,
    rounds_survived smallint DEFAULT 20,
    three_stars jsonb DEFAULT '[]'::jsonb,
    verified boolean DEFAULT false,
    evidence_id character varying(64),
    batch_id character varying(64),
    revision integer DEFAULT 1,
    source_record_key character varying(128),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT matches_final_rank_check CHECK (((final_rank >= 1) AND (final_rank <= 6)))
);


--
-- Name: players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.players (
    id character varying(64) NOT NULL,
    nickname character varying(64) NOT NULL,
    platform character varying(32) DEFAULT 'DEFAULT'::character varying,
    server_zone character varying(64) DEFAULT '手Q1区'::character varying,
    rank_score integer DEFAULT 10000,
    rank_text character varying(32) DEFAULT '最强王者'::character varying,
    title character varying(64) DEFAULT ''::character varying,
    commander character varying(32) DEFAULT '通用'::character varying,
    style character varying(64) DEFAULT '常规'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: event_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants ALTER COLUMN id SET DEFAULT nextval('public.event_participants_id_seq'::regclass);


--
-- Name: event_participants event_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_pkey PRIMARY KEY (id);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: evidences evidences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidences
    ADD CONSTRAINT evidences_pkey PRIMARY KEY (id);


--
-- Name: evidences evidences_sha256_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidences
    ADD CONSTRAINT evidences_sha256_key UNIQUE (sha256);


--
-- Name: import_batches import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_batches
    ADD CONSTRAINT import_batches_pkey PRIMARY KEY (batch_id);


--
-- Name: lineup_snapshots lineup_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lineup_snapshots
    ADD CONSTRAINT lineup_snapshots_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: event_participants uq_event_slot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT uq_event_slot UNIQUE (event_id, slot);


--
-- Name: matches uq_player_match_time; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT uq_player_match_time UNIQUE (player_id, match_time);


--
-- Name: idx_events_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_scheduled_at ON public.events USING btree (scheduled_at DESC);


--
-- Name: idx_matches_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_batch ON public.matches USING btree (batch_id);


--
-- Name: idx_matches_player_cutoff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matches_player_cutoff ON public.matches USING btree (player_id, match_time, available_at) WHERE (verified = true);


--
-- Name: idx_players_nickname; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_players_nickname ON public.players USING btree (nickname);


--
-- Name: idx_players_rank_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_players_rank_score ON public.players USING btree (rank_score DESC);


--
-- Name: event_participants event_participants_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_participants event_participants_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_participants
    ADD CONSTRAINT event_participants_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: events events_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidences(id) ON DELETE SET NULL;


--
-- Name: matches matches_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidences(id) ON DELETE SET NULL;


--
-- Name: matches matches_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

