-- MAJOBELLA · Los cinco campos de «Ver detalle» son editables por servicio.
-- Se conserva toda la información histórica y la descripción breve existente.
ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS detalle jsonb;

COMMENT ON COLUMN public.servicios.detalle IS
  'Ficha de tratamiento: idealFor, includes, results, prep y aftercare editados en ADM.';
