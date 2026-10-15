-- Exact private aggregates over instrumented requests; legacy duplicate event rows
-- remain intact and are not relabelled as measured provider requests.
CREATE OR REPLACE VIEW public.ai_measured_request_analytics AS
 SELECT provider,model,count(*)::bigint AS total_calls,
 count(*) FILTER(WHERE outcome='success')::bigint AS successes,
 count(*) FILTER(WHERE outcome='failure')::bigint AS failures,
 count(*) FILTER(WHERE outcome='reserved')::bigint AS in_flight,
 round(avg(extract(epoch FROM(finished_at-started_at))*1000) FILTER(WHERE finished_at IS NOT NULL)) AS avg_ms,
 max(started_at) AS last_call
 FROM public.ai_model_requests GROUP BY provider,model;
CREATE OR REPLACE VIEW public.ai_measured_request_hourly AS
 SELECT provider,date_trunc('hour',started_at) AS hour,count(*)::bigint AS calls,
 count(*) FILTER(WHERE outcome='success')::bigint AS successes,
 count(*) FILTER(WHERE outcome='failure')::bigint AS failures,
 round(avg(extract(epoch FROM(finished_at-started_at))*1000) FILTER(WHERE finished_at IS NOT NULL)) AS avg_ms
 FROM public.ai_model_requests GROUP BY provider,date_trunc('hour',started_at);
REVOKE ALL ON public.ai_measured_request_analytics,public.ai_measured_request_hourly FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_measured_request_analytics,public.ai_measured_request_hourly TO service_role;
