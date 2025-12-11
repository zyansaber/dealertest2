export type ShowTask = {
  id: string;
  eventId: string;
  taskName: string;
  status: string;
  assignedTo?: string;
  dueDate?: string;
  notes?: string;
};
