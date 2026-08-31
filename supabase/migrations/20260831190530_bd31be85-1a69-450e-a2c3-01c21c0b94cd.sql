DROP POLICY IF EXISTS "Users read own private or public realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "Users send own private or public realtime topics" ON realtime.messages;

-- Read: own personal topic, or the single global announcements topic (read-only)
CREATE POLICY "Users read own or global realtime topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() = ('private:' || (auth.uid())::text)
  OR realtime.topic() = 'public:announcements'
);

-- Send: strictly own personal topic. Global topic is publishable only by service_role.
CREATE POLICY "Users send only on their own realtime topic"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() = ('private:' || (auth.uid())::text)
);