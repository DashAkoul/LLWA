import React, { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../src/api';
import type { SupportMessage, SupportTicket } from '../src/api';
import { useTheme } from '../src/theme/ThemeProvider';
import { AppText, Button, Card, EmptyState, Screen } from '../src/ui';

/**
 * پشتیبانی — لیست تیکت + ساخت تیکت + گفت‌وگو.
 *
 * ⚠️ `ticketId` به‌صورت query param می‌رود، نه در مسیر. چسباندن `&` به
 * رشتهٔ URL باعث encode شدن و ۴۰۴ می‌شود.
 */
export default function SupportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const listQuery = useQuery({ queryKey: ['support-list'], queryFn: () => api.supportList() });
  const threadQuery = useQuery({
    queryKey: ['support-thread', openTicket],
    queryFn: () => api.supportThread(openTicket!),
    enabled: Boolean(openTicket),
  });

  const tickets = listQuery.data?.tickets ?? [];
  const messages: SupportMessage[] = threadQuery.data?.messages ?? [];

  const createTicket = async () => {
    if (subject.trim().length < 3 || body.trim().length < 5) return;
    setSending(true);
    try {
      await api.supportCreate({ subject: subject.trim(), body: body.trim(), category: 'GENERAL' });
      setCreating(false);
      setSubject('');
      setBody('');
      await qc.invalidateQueries({ queryKey: ['support-list'] });
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!openTicket || reply.trim().length < 2) return;
    setSending(true);
    try {
      await api.supportReply(openTicket, reply.trim());
      setReply('');
      await qc.invalidateQueries({ queryKey: ['support-thread', openTicket] });
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen scroll={!openTicket}>
      <View style={{ paddingTop: insets.top + 8, gap: 16, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons
            name="arrow-back"
            size={22}
            color={colors.text}
            onPress={() => (openTicket ? setOpenTicket(null) : router.back())}
          />
          <AppText variant="h2" weight="800" style={{ flex: 1 }}>
            {t('mobile.support.title')}
          </AppText>
          {!openTicket ? (
            <Pressable onPress={() => setCreating((v) => !v)} hitSlop={10}>
              <Ionicons name={creating ? 'close' : 'add'} size={24} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>

        {/* ساخت تیکت */}
        {creating && !openTicket ? (
          <Card style={{ gap: 10 }}>
            <AppText variant="small" weight="700">
              {t('mobile.support.new')}
            </AppText>
            <Field placeholder={t('mobile.support.subject')} value={subject} onChange={setSubject} />
            <Field placeholder={t('mobile.support.message')} value={body} onChange={setBody} multiline />
            <Button
              label={t('mobile.support.send')}
              onPress={createTicket}
              loading={sending}
              disabled={subject.trim().length < 3 || body.trim().length < 5}
            />
          </Card>
        ) : null}

        {/* گفت‌وگوی یک تیکت */}
        {openTicket ? (
          <View style={{ flex: 1, gap: 12 }}>
            {threadQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <View style={{ gap: 10 }}>
                {messages.map((m) => (
                  <View
                    key={m.id}
                    style={{
                      alignSelf: m.fromAdmin ? 'flex-start' : 'flex-end',
                      maxWidth: '85%',
                      backgroundColor: m.fromAdmin ? colors.bgSecondary : colors.accentSoft,
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <AppText variant="small">{m.body}</AppText>
                  </View>
                ))}
                {!messages.length ? (
                  <AppText variant="small" tone="textHint">
                    —
                  </AppText>
                ) : null}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 'auto' }}>
              <View style={{ flex: 1 }}>
                <Field placeholder={t('mobile.support.reply')} value={reply} onChange={setReply} />
              </View>
              <Button
                label={t('mobile.support.send')}
                onPress={sendReply}
                loading={sending}
                fullWidth={false}
                disabled={reply.trim().length < 2}
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {listQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
            {!listQuery.isLoading && !tickets.length ? (
              <EmptyState icon="chatbubble-ellipses-outline" title={t('mobile.support.empty')} />
            ) : null}
            {tickets.map((tk) => (
              <TicketRow key={tk.id} ticket={tk} onPress={() => setOpenTicket(tk.id)} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function TicketRow({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const closed = ticket.status === 'CLOSED' || ticket.status === 'RESOLVED';
  return (
    <Pressable onPress={onPress}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <AppText variant="body" weight="600" numberOfLines={1}>
            {ticket.subject}
          </AppText>
          <AppText variant="caption" tone="textHint">
            {closed ? t('mobile.support.closed') : t('mobile.support.open')}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Card>
    </Pressable>
  );
}

function Field({
  placeholder,
  value,
  onChange,
  multiline,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      multiline={multiline}
      style={{
        backgroundColor: colors.bgSecondary,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        color: colors.text,
        fontSize: 15,
        minHeight: multiline ? 90 : 46,
        textAlignVertical: multiline ? 'top' : 'center',
      }}
    />
  );
}
