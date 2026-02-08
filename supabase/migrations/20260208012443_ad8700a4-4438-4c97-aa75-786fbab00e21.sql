-- Add full_name and date_of_birth columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS full_name text,
ADD COLUMN IF NOT EXISTS date_of_birth text;