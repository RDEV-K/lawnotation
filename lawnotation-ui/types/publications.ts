export type Publication = {
  id: number;
  editor_id: string,
  status: "published" | "unpublished"
  file_url: string;
  guidelines_url: string;
  task_name: string;
  labels_name: string;
  author: string;
  contact: string;
};
