import { supabase } from "./supabase";

// Types pour les messages
export interface Message {
  id: number;
  role: string;
  content: string;
  timestamp: string;
}

export interface InsertMessage {
  role: string;
  content: string;
}

export interface IStorage {
  createMessage(message: InsertMessage): Promise<Message>;
}

export class DatabaseStorage implements IStorage {
  async createMessage(message: InsertMessage): Promise<Message> {
    const { data, error } = await supabase
      .from("messages")
      .insert({
        role: message.role,
        content: message.content,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Erreur création message: ${error.message}`);
    }

    return data;
  }
}

export const storage = new DatabaseStorage();
