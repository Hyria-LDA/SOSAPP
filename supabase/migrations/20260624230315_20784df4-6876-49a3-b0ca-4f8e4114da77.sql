UPDATE public.banners
SET imagem_url = substring(imagem_url FROM '/storage/v1/object/(?:sign|public)/banners/([^?]+)')
WHERE imagem_url ~ '/storage/v1/object/(sign|public)/banners/';