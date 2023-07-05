import { AnnotationRelation, LSSerializedRelation } from '@/types/relation';
import { Annotation } from '@/types/annotation';
import crud_data from './common/crud.supabase';
import createSupabaseClient from './common/client.supabase';

// TODO: move these conver_* methods to API? (more closely to labelstudio itself)
export const convert_ls2db = (rel: LSSerializedRelation, from_id: number, to_id: number): Omit<AnnotationRelation, "id"> => {
  return {
    ls_from: rel.from_id,
    ls_to: rel.to_id,
    direction: rel.direction,
    labels: rel.labels,
    from_id: from_id,
    to_id: to_id,
  };
}

export const convert_db2ls = (rel: AnnotationRelation): LSSerializedRelation => {
  return {
    from_id: rel.ls_from,
    to_id: rel.ls_to,
    labels: rel.labels,
    direction: rel.direction,
    type: 'relation'
  };
}

const client = createSupabaseClient();

export const relationDataService = {
  ...crud_data('annotation_relations'),

  // Create
  create: async (fields: LSSerializedRelation, from_id: number, to_id: number): Promise<AnnotationRelation> => {
    const { data, error } = await client.from("annotation_relations").insert(convert_ls2db(fields, from_id, to_id)).select().single();

    if (error)
      throw Error(`Error in createRelation: ${error.message}`)
    else
      return data as AnnotationRelation;
  },
  
  find: async (anns: Annotation[]): Promise<AnnotationRelation[]> => {
      var relations: AnnotationRelation[] = [];
      for (let i = 0; i < anns.length; ++i) {
          const { data, error } = await client.from("annotation_relations").select().eq("from_id", anns[i].id);
          relations.push(...data as AnnotationRelation[]);
      }
      return relations;
  },

  // This as already commented out. Is it still needed?
  /*
  update: async (relations: LSSerializedRelation[]): Promise<AnnotationRelation[] | null> => {
    const query_delete = await client.from("annotations").delete().eq("assignment_id", assignment_id);

    if (query_delete.error)
      throw Error(`Unable to delete annotations on update: ${query_delete.error.message}`)
    const query_insert = await client.from("annotations").insert(annotations).select();
    if (query_insert.error)
      throw Error(`Unable to insert annotations on update: ${query_insert.error.message}`)

    annotations.push(...query_insert.data);
    console.log("updated annotations: ", query_insert.data);

    return query_insert.data;
  }
  */
}

export default relationDataService;