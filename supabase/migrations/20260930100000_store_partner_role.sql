-- Aplicar e confirmar esta migração antes da seguinte (novo valor ENUM).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_partner';
