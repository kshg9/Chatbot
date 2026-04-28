'use server';

import { revalidatePath } from 'next/cache';

import { generateReply } from '@/lib/chat-engine';
import {
  appendMessage,
  buildSnapshot,
  createConversation,
  deleteAllConversations,
  deleteConversation,
  getConversation,
  getSettings,
  renameConversation,
  setConversationModel,
  updateSettings,
} from '@/lib/offline-db';
import type { AppSettings, StoredConversation } from '@/lib/offline-types';

export async function createConversationAction(model?: string) {
  const settings = getSettings();
  const conversation = createConversation(model || settings.model);
  revalidatePath('/');
  return conversation;
}

export async function sendMessageAction(input: {
  conversationId?: string | null;
  message: string;
  model?: string;
  temperature?: number;
}): Promise<StoredConversation> {
  const settings = updateSettings({
    model: input.model,
    temperature: input.temperature,
  });

  const trimmedMessage = input.message.trim();
  if (!trimmedMessage) {
    throw new Error('Message cannot be empty.');
  }

  let conversation = input.conversationId ? getConversation(input.conversationId) : null;
  if (!conversation) {
    conversation = createConversation(settings.model, trimmedMessage);
  } else if (conversation.model !== settings.model) {
    setConversationModel(conversation.id, settings.model);
    conversation = getConversation(conversation.id);
  }

  appendMessage(conversation.id, 'user', trimmedMessage);

  const withUserMessage = getConversation(conversation.id);
  if (!withUserMessage) {
    throw new Error('Conversation was not found after saving the message.');
  }

  const reply = await generateReply({
    model: settings.model,
    temperature: settings.temperature,
    history: withUserMessage.messages,
  });

  appendMessage(conversation.id, 'assistant', reply || '...');
  revalidatePath('/');

  const updatedConversation = getConversation(conversation.id);
  if (!updatedConversation) {
    throw new Error('Conversation was not found after generating the reply.');
  }

  return updatedConversation;
}

export async function selectConversationAction(conversationId: string | null) {
  return buildSnapshot(conversationId);
}

export async function renameConversationAction(conversationId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error('Title cannot be empty.');
  }
  renameConversation(conversationId, trimmed);
  revalidatePath('/');
  return buildSnapshot(conversationId);
}

export async function deleteConversationAction(conversationId: string) {
  deleteConversation(conversationId);
  revalidatePath('/');
  return buildSnapshot(null);
}

export async function clearAllConversationsAction() {
  deleteAllConversations();
  revalidatePath('/');
  return buildSnapshot(null);
}

export async function updateSettingsAction(next: Partial<AppSettings>) {
  const settings = updateSettings(next);
  revalidatePath('/');
  return settings;
}
