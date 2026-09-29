-- More generation providers through the Provider Gateway (owner, 2026-09-29: "we need all the script, image and video
-- generation providers hooked up, not just OpenAI and Runway"): Google (Imagen, Gemini image, Veo), Stability AI, Black
-- Forest Labs FLUX, Luma, Kling and MiniMax Hailuo. Takes record which one made them.
alter table public.takes drop constraint if exists takes_provider_check;
alter table public.takes add constraint takes_provider_check
  check (provider in ('aurastage-sketch','runway','openai','google','stability','bfl','luma','kling','minimax'));
