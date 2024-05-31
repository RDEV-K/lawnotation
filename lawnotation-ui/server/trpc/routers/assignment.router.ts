import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { authorizer, protectedProcedure, router } from "~/server/trpc";
import type { Assignment, User } from "~/types";
import type { Context } from "../context";
import { zValidEmail } from "~/utils/validators";
import { MailtrapClient } from "mailtrap"
import postgres from "postgres";

const ZAssignmentFields = z.object({
  annotator_id: z.string().nullable(),
  task_id: z.number().int(),
  document_id: z.number().int(),
  status: z.union([z.literal("pending"), z.literal("done")]),
  seq_pos: z.number().int(),
  difficulty_rating: z.number().int(),
  annotator_number: z.number().int()
});

const assignmentAuthorizer = async (
  assignment_id: number,
  user_id: string,
  ctx: Context
) => {
  const query = ctx.supabase
    .from("assignments")
    .select("*, task:tasks!inner(id, project:projects!inner(editor_id))", {
      count: "exact",
      head: true,
    })
    .eq("id", assignment_id);

  const editor = await query.eq("tasks.projects.editor_id", user_id);

  const annotator = await query.eq("annotator_id", user_id);

  return editor.count === 1 || annotator.count === 1;
  // return true;
};

export const assignmentRouter = router({
  /**
   * This method creates inivites an email to create an account if it doesn't 
   * already have one. Next, it will assign the provided task_id to the metadata
   * of the user account, so that a flash message appears when they log-in.
   * Note that this method doesn't actually create the assignments.
   */
  assignUserToTask: protectedProcedure
    .input(
      z.object({
        email: zValidEmail,
        task_id: z.number()
      })
    )
    .query(async ({ctx, input}) => {
      const email_found = await ctx.supabase.from('users').select().eq('email', input.email).maybeSingle();
      let user_id: User['id'] | null = null;
      if (!email_found.data) {
        // email is a new user.
        const invite = await ctx.supabase.auth.admin.inviteUserByEmail(input.email, {data: {assigned_task_id: input.task_id}})

        if (invite.error)
          throw new TRPCError({code: "INTERNAL_SERVER_ERROR", message: `Error inviting: ${invite.error.message}`});
        
        user_id = invite.data.user.id as string;
      } else {
        // email is already an user
        user_id = email_found.data.id as string;
        const user_email = email_found.data.email as string;

        await ctx.supabase.auth.admin.updateUserById(user_id, {user_metadata: {assigned_task_id: input.task_id}})

        const config = useRuntimeConfig();
        // send email to existing user
        if (!config.mailtrapToken)
          throw Error("Mailtrap API token not set")

        const mailClient = new MailtrapClient({ token: config.mailtrapToken });

        const body = `Hello ${user_email},<br />
        You have been assigned to a new task. <a href="${config.public.baseURL}/annotate/${input.task_id}?seq=1">Click here</a> to start annotating this task.`;

        const mail = await mailClient.send({
          from: {email: 'no-reply@login.lawnotation.org', name: 'Lawnotation'},
          to: [{email: user_email}],
          subject: 'Assigned to new task',
          html: body
        })
  
        if (!mail.success)
          throw new TRPCError({message: 'There was an error sending an email to the invited user.', code: 'INTERNAL_SERVER_ERROR'})
        
      }

      if (!user_id)
        throw new TRPCError({code: "INTERNAL_SERVER_ERROR", message: `Error retrieving or inviting the specified user`});

      return user_id;
    }),

  importAssignments: protectedProcedure
    .input(
      z.object({
        email: zValidEmail,
        task_id: z.number()
      })
    )
    .query(async ({ctx, input}) => {
      const invite = await ctx.supabase.auth.admin.inviteUserByEmail(input.email, {data: {invited_task_id: input.task_id}})

      if (invite.error)
        throw new TRPCError({code: "INTERNAL_SERVER_ERROR", message: `Error inviting: ${invite.error.message}`});
      
      
      
      return ;
    }),

  create: protectedProcedure
    .input(ZAssignmentFields)
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .insert(input)
        .select()
        .single();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in assignment.create: ${error.message}`,
        });
      return data as Assignment;
    }),

  createMany: protectedProcedure
    .input(
      z.array(
        // object is equal to ZAssignmentFields, but with optional's, since partial didn't work. check later
        z.object({
          annotator_id: z.string().optional(),
          task_id: z.number().int(),
          document_id: z.number().int(),
          status: z.union([z.literal("pending"), z.literal("done")]).optional(),
          seq_pos: z.number().int().optional(),
          difficulty_rating: z.number().int().optional(),
          annotator_number: z.number().int().optional()
        })
      )
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .insert(input)
        .select();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in createMany: ${error.message}`,
        });
      return data as Assignment[];
    }),

  findById: protectedProcedure
    .input(z.number().int())
    .use((opts) =>
      authorizer(opts, () =>
        assignmentAuthorizer(opts.input, opts.ctx.user.id, opts.ctx)
      )
    )
    .query(async ({ ctx, input: id }) => {
      const { data, error, count } = await ctx.supabase
        .from("assignments")
        .select()
        .eq("id", id)
        .single();

      if (count === 0) throw new TRPCError({ code: "NOT_FOUND" });
      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in find: ${error.message}`,
        });
      return data as Assignment;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        updates: ZAssignmentFields.partial(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .update(input.updates)
        .eq("id", input.id)
        .select()
        .single();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in update: ${error.message}`,
        });
      return data as Assignment;
    }),

  delete: protectedProcedure
    .input(z.number().int())
    .mutation(async ({ ctx, input: assignment_id }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .delete()
        .eq("id", assignment_id);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in delete: ${error.message}`,
        });
      return true;
    }),

  getCountByUser: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: e_id }) => {
      const { data, error } = await ctx.supabase
        .rpc("get_count_assignments", { e_id: e_id })
        .single();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in getCountByUser: ${error.message}`,
        });
      return data;
    }),

    getCountByProject: protectedProcedure
    .input(z.number().int())
    .query(async ({ ctx, input: p_id }) => {
      const { data, error, count } = await ctx.supabase
        .from("assignments")
        .select("*, task:tasks!inner(project_id)", { count: "exact" })
        .eq("tasks.project_id", p_id);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in getCountByUser: ${error.message}`,
        });
      return count;
    }),

  getDifficultiesByEditor: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: e_id }) => {
      const { data, error } = await ctx.supabase.rpc(
        "get_difficulties_by_editor",
        {
          e_id: e_id,
        }
      );

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in getDifficultiesByEditor: ${error.message}`,
        });
      return data;
    }),

  getCompletionByEditor: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: e_id }) => {
      const { data, error } = await ctx.supabase.rpc(
        "get_completion_by_editor",
        {
          e_id: e_id,
        }
      );

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in getCompletionByEditor: ${error.message}`,
        });
      return data;
    }),

  getCompletionByAnnotator: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: a_id }) => {
      const { data, error } = await ctx.supabase.rpc(
        "get_completion_by_annotator",
        {
          a_id: a_id,
        }
      );

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in getCompletionByAnnotator: ${error.message}`,
        });
      return data;
    }),

  findAssignmentsByTask: protectedProcedure
    .input(z.number().int())
    .query(async ({ ctx, input: task_id }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .select()
        .eq("task_id", task_id)
        .order("id", { ascending: true });

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in findAssignmentsByTask: ${error.message}`,
        });
      return data as Assignment[];
    }),

    findAssignmentsByTaskAndUser: protectedProcedure
    .input(z.object({
      annotator_id: z.string().optional(),
      annotator_number: z.number().int().optional(),
      task_id: z.number().int()
    }))
    .query(async ({ ctx, input }) => {
      
      let query = ctx.supabase
      .from("assignments")
      .select()
      .eq("task_id", input.task_id);

      if(input.annotator_id) {
        query = query.eq("annotator_id", input.annotator_id);
      }

      if(input.annotator_number) {
        query = query.eq("annotator_number", input.annotator_number);
      }

      const { data, error } = await query.order("id", { ascending: true });

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in findAssignmentsByTaskAndUser: ${error.message}`,
        });
      return data as Assignment[];
    }),

  findAssignmentsByUserTaskSeq: protectedProcedure
    .input(
      z.object({
        annotator_id: z.string(),
        task_id: z.number().int(),
        seq_pos: z.number().int(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .select()
        .eq("task_id", input.task_id)
        .eq("annotator_id", input.annotator_id)
        .eq("seq_pos", input.seq_pos)
        .single();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in findAssignmentsByUserTaskSeq: ${error.message}`,
        });
      return data as Assignment;
    }),

  findAssignmentsByUser: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: user_id }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .select()
        .eq("annotator_id", user_id);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in findAssignmentsByUser: ${error.message}`,
        });
      return data as Assignment[];
    }),

  findNextAssignmentsByUserAndTask: protectedProcedure
    .input(
      z.object({
        annotator_id: z.string(),
        task_id: z.number().int(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .rpc("next_random_assignment", {
          a_id: input.annotator_id,
          t_id: input.task_id,
        })
        .single();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in findNextAssignmentsByUserAndTask: ${error.message}`,
        });
      return data as Assignment;
    }),

  findNextAssignmentByUser: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: user_id }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .select()
        .eq("annotator_id", user_id)
        .eq("status", "pending")
        .order("task_id", { ascending: false })
        .order("seq_pos", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in findNextAssignmentByUser: ${error.message}`,
        });
      return data as Assignment | null;
    }),

  countAssignmentsByUserAndTask: protectedProcedure
    .input(
      z.object({
        annotator_id: z.string(),
        task_id: z.number().int(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data: next, error: error_next } = await ctx.supabase
        .from("assignments")
        .select("seq_pos")
        .eq("annotator_id", input.annotator_id)
        .eq("task_id", input.task_id)
        .eq("status", "pending")
        .order("seq_pos", { ascending: true })
        .limit(1)
        .maybeSingle();
      // const { data: total, error: error_total } = await ctx.supabase
      const { error: error_total, count } = await ctx.supabase
        .from("assignments")
        // .select("count")
        .select("*", { count: "exact", head: true })
        .eq("annotator_id", input.annotator_id)
        .eq("task_id", input.task_id);
      // .single();

      if (error_next) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in 1 countAssignmentsByUserAndTask: ${error_next.message}`,
        });
      } else if (error_total) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in 2 countAssignmentsByUserAndTask: ${error_total.message}`,
        });
      // return {
      //   next: next?.seq_pos ?? total?.count! + 1, // TODO: need to check if this actually works
      //   total: total?.count ?? 0,
      // };
      } else {
        return {
          next: next?.seq_pos ?? count! + 1, // TODO: need to check if this actually works
          total: count ?? 0,
        };
      }
    }),

  deleteAllFromTask: protectedProcedure
    .input(z.number().int())
    .mutation(async ({ ctx, input: task_id }) => {
      const { data, error } = await ctx.supabase
        .from("assignments")
        .delete()
        .eq("task_id", task_id);

      if (error)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error in deleteAllAssignmentsFromTask: ${error.message}`,
        });
      return true;
    }),
    
    getGroupByAnnotators: protectedProcedure
      .input(z.object({
        task_id: z.number().int(),
        page: z.number().int(),
        filter: z.object({
          name: z.string()
        })
      }))
      .query(async ({ctx, input}) => {
        const rowsPerPage = 10;
        
        type TreeItem = {
          type: 'annotator',
          key: string,
          data: {
            name: string,
            amount_done: number,
            amount_total: number,
            next_seq_pos: number
          },
          children: {
            type: 'document',
            key: string,
            data: {
              assignment_id: number,
              seq_pos: number,
              document_id: number,
              document_name: string,
              difficulty_rating: number,
              status: string
            }
          }[]
        };

        const grouped: TreeItem[] = []

        const count = (await ctx.sql`SELECT DISTINCT annotator_number FROM assignments WHERE task_id = ${input.task_id}`).count

        const sanitizedFilter = input.filter.name.replace(/[%_]/g, '')
        const annotatorNameComputation = ctx.sql.unsafe("COALESCE(u.email, CONCAT('annotator ', a.annotator_number))")

        const queryAnnotators = ctx.sql<{annotator_number: number, email?: string, annotator_name: string}[]>`
          SELECT DISTINCT a.annotator_number, u.email, ${annotatorNameComputation} as annotator_name
          FROM assignments AS a
          LEFT JOIN users AS u
            ON (a.annotator_id = u.id)
          WHERE a.task_id = ${input.task_id}
          ${
            sanitizedFilter
              ? ctx.sql`AND ${annotatorNameComputation} ILIKE ${ '%' + sanitizedFilter + '%' }`
              : ctx.sql``
          }
          ORDER BY annotator_number
          LIMIT ${rowsPerPage} OFFSET ${(input.page-1) * rowsPerPage}
        `
      
        await queryAnnotators.cursor(async ([dbAnnotator]) => {

            const dbAssignments = await ctx.sql`
              SELECT a.*, u.email, d.name AS document_name
              FROM assignments AS a
              INNER JOIN documents AS d
                ON (a.document_id = d.id)
              LEFT JOIN users AS u
                ON (a.annotator_id = u.id)
              WHERE annotator_number = ${dbAnnotator.annotator_number}
              AND a.task_id = ${input.task_id}
            `

            const children: TreeItem['children'] = []

            for (const dbAssignment of dbAssignments) {
              children.push({
                type: 'document',
                key: `ass-${dbAssignment.id}`,
                data: {
                  assignment_id: dbAssignment.id,
                  seq_pos: dbAssignment.seq_pos,
                  document_id: dbAssignment.document_id,
                  document_name: dbAssignment.document_name,
                  difficulty_rating: dbAssignment.difficulty_rating,
                  status: dbAssignment.status
                },
              })
            }

            grouped.push({
              type: 'annotator',
              key: `ann-${dbAnnotator.annotator_number}`,
              data: {
                name: dbAnnotator.annotator_name, // dbAnnotator.email ?? `annotator ${dbAnnotator.annotator_number}`,
                amount_done: dbAssignments.filter(ass => ass.status == "done").length,
                amount_total: dbAssignments.length,
                next_seq_pos: Math.min(...dbAssignments.filter(ass => ass.status == 'pending').map(ass => ass.seq_pos!))
              },
              children
            })
        })

        return {data: grouped ?? [], total: count ?? 0 };
      }),
    
    getGroupByDocuments: protectedProcedure
      .input(z.object({
        task_id: z.number().int(),
        page: z.number().int(),
        filter: z.object({
          document: z.string()
        }),
        // sort: z.object({
        //   field: z.union([
        //     z.literal('name'),
        //     z.literal('progress')
        //   ])
        // })
      }))
      .query(async ({ctx, input}) => {
        const rowsPerPage = 10;

        const query = ctx.supabase
          .from("documents")
          .select(
            "id, name, assignments!inner(id, task_id, seq_pos, annotator_number, status, difficulty_rating, user:users(id, email))",
            { count: "exact" }
          )
          .eq("assignments.task_id", input.task_id)
          .order("seq_pos", { referencedTable: "assignments", ascending: true })
          .range((input.page - 1) * rowsPerPage, input.page * rowsPerPage)
      
        if (input.filter.document.length)
          query.ilike("name", `%${input.filter.document}%`)
        
        const { data, error, count } = await query
        
        if (error)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Error in getGroupByAnnotators: ${error.message}`,
          });
        
        const grouped = data
          .map(doc => ({
            type: 'document',
            key: `doc-${doc.id}`,
            data: {
              document_id: doc!.id,
              document_name: doc!.name,
              amount_done: doc.assignments.filter(ass => ass.status == "done").length,
              amount_total: doc.assignments.length,
              next_seq_pos: Math.min(...doc.assignments.filter(doc => doc.status == 'pending').map(ass => ass.seq_pos!))
            },
            children: doc.assignments!.map(ass => ({
              type: 'annotator',
              key: `ass-${ass.id}`,
              data: {
                name: ass.user?.email ?? `annotator ${ass.annotator_number}`,
                seq_pos: ass.seq_pos,
                difficulty_rating: ass.difficulty_rating,
                status: ass.status
              }
            }))
          }))
        
        return {data: grouped ?? [], total: count ?? 0 };
      })

});

export type AssignmentRouter = typeof assignmentRouter;
