<template>
  <div  id="label-studio-container" class="h-full">
    <div v-if="assignment" class="px-4 my-2 flex items-center justify-between">
      <div class="flex items-center">
        <NuxtLink v-if="guidelines" :to="guidelines" target="_blank" class="mr-3">
          <Button label="See Annotation Guidelines" size="small" outlined />
        </NuxtLink>
        <Badge :value="assignment.status" :severity="assignment.status == AssignmentStatuses.DONE ? 'success' : 'danger'"
          class="capitalize px-2" />
      </div>
      <div v-if="!isEditor && previousCount != undefined && totalCount" class="flex items-center w-1/3">
        <span class="font-semibold mr-2">{{ previousCount }}/{{ totalCount }}</span>
        <span class="w-full">
          <ProgressBar :value="Math.round((previousCount / totalCount) * 100)"> {{ Math.round(previousCount / totalCount * 100)}}% </ProgressBar>
        </span>
      </div>
      <div v-if="!isEditor && totalCount && previousCount != undefined">
        <Button :disabled="previousCount <= 1" label="Back" class="mr-3" icon="pi pi-arrow-left" @click="Done(Direction.PREVIOUS)" icon-pos="left" outlined />
        <Button :label="previousCount < totalCount ? 'Next' : 'Finish'" icon="pi pi-arrow-right" @click="Done(Direction.NEXT)" icon-pos="right" />
      </div>
      <div v-else>
        <Button label="Save" icon="pi pi-check" @click="Done(Direction.CURRENT)" icon-pos="right" />
      </div>
    </div>
    <div id="label-studio" class="h-full"></div>
  </div>
</template>
<script setup lang="ts">
import "@heartexlabs/label-studio/build/static/css/main.css";
import type {
  LSSerializedRelation,
  Assignment,
  LsLabels,
  LSSerializedAnnotations,
} from "~/types";
import { AnnotationLevels, AssignmentStatuses, Direction, Origins } from "~/utils/enums";

const { $trpc, $toast } = useNuxtApp();

const label_studio = ref();

const emit = defineEmits(["previousAssignment", "nextAssignment"]);

const props = defineProps<{
  user: any;
  assignment: Assignment | undefined;
  totalCount: number | undefined;
  previousCount: number | undefined;
  annotations: LSSerializedAnnotations | undefined;
  relations: LSSerializedRelation[] | undefined;
  text: string | undefined;
  labels: LsLabels | undefined;
  isEditor: boolean | undefined;
  guidelines: string | undefined;
  annotation_level: AnnotationLevels;
  isHtml: boolean;
}>();

const doc_confidence_ann = ref({
  origin: Origins.MANUAL,
  from_name: "doc_confidence",
  to_name: "doc_confidence",
  type: "rating",
  value: {
    rating: props.assignment?.difficulty_rating ?? 0
  }
});

const showSideColumn = computed(() => {
  // return props.annotation_level != AnnotationLevels.DOCUMENT && !props.isEditor;
  return props.annotation_level != AnnotationLevels.DOCUMENT;
});

const initLS = async () => {
  // Following is to prevent error:
  const script = document.createElement("script");
  script.src = "data:text/javascript,void(0);";
  document.body.appendChild(script);

  // @ts-expect-error
  const LabelStudio = (await import("@heartexlabs/label-studio")).default;
  label_studio.value = new LabelStudio("label-studio", {
    config: `<View style="display: grid; grid-template-columns: min-content 1fr; grid-template-rows: 1fr min-content; height: 100%; min-height: 0;">
              <View style="min-width: 200px; background: #f1f1f1; border-radius: 3px; padding: .3rem; overflow-y: auto; display: flex; flex-direction: column; flex: 1">
                ${(props.annotation_level != AnnotationLevels.DOCUMENT)
                  ?
                  `<Filter name="fl" toName="label" hotkey="shift+f" minlength="1" />
                    <${props.isHtml ? "HyperTextLabels" : "Labels"} style="padding-left: 2em; margin-right: 2em;" name="label" toName="text">
                     ${props.labels?.map((l, index) => (`<Label value="${l.name}" background="${l.color}" selected="${!props.isEditor && index == 0}" style="display: inline-table; user-select: none;"/>`)).join("\n")}
                    </${props.isHtml ? "HyperTextLabels" : "Labels"}>`
                  :
                  `<Choices name="label" toName="text" choice="multiple">
                    ${props.labels?.map((l) => (`<Choice value="${l.name}" style="background-color: ${l.color}26; border-left:4px solid ${l.color}; padding-left: .25rem; border-radius: .25rem; width: min-content;" />`)).join("\n")}
                  </Choices>`
                }
                <View style="border-top: 1px solid rgba(0,0,0,.1); padding: 10px 5px; margin-top: auto">
                  ${props.annotation_level != AnnotationLevels.DOCUMENT
                    ?
                    `<View visibleWhen="region-selected" style="margin-bottom: 10px">
                      <Header value="Annotation Confidence" style="margin-bottom: 0; margin: 0px; user-select: none; font-size: medium" />
                        <Rating name="ann_confidence" toName="text" perRegion="true" />
                    </View>`
                    :
                    ``
                  }
                  <View>
                    <Header style="margin-bottom: 0; margin: 0px; user-select: none; font-size: medium" value="Document Confidence"/>
                    <Rating toName="doc_confidence" name="doc_confidence" maxRating="5" icon="star" size="medium" />
                  </View>
                </View>
              </View>
                  <View style="width: 100%; overflow-y: auto;">
                    <View style="height: auto; padding: 0 1.7em 1em;">
                      <${props.isHtml ? "HyperText" : "Text"} name="text" value="$text" inline="true" ${props.annotation_level != AnnotationLevels.DOCUMENT ? `granularity="${props.annotation_level}"` : ''}/>
                    </View>
                    <Relations>
                      <Relation value="Is a" />
                      <Relation value="Has a" />
                      <Relation value="Implies" />
                      <Relation value="Depends on" />
                      <Relation value="Belongs to" />
                      <Relation value="Related to" />
                      <Relation value="Is not" />
                      <Relation value="Part of" />
                    </Relations>
                  </View>
                </View>
                `,
    settings: {
      continuousLabeling: true,
      selectAfterCreate: true,
      showLabels: true
    },
    interfaces: [
      showSideColumn.value ? "side-column" : "",
    ],
    user: {
      pk: 1,
      firstName: props.user.value?.email,
    },
    task: {
      annotations: [{
        result: (props.annotations as any).concat(props.relations).concat([doc_confidence_ann.value])
      }],
      // predictions: this.predictions,
      data: {
        text: props.text,
      },
    },
    onLabelStudioLoad: (LS: any) => {
      LS.annotationStore.selectAnnotation(LS.annotationStore.annotations);
    },
  });

};

const serializeLSAnnotations = () => {
  return label_studio.value.store.annotationStore.annotations.map((a: any) =>
    a.serializeAnnotation()
  )[0];
};

const Done = async (dir: Direction) => {
  if(await save(dir)) {
    if(props.totalCount) {
      switch (dir) {
        case Direction.PREVIOUS:
          emit("previousAssignment");
          break;
        case Direction.NEXT:
          emit("nextAssignment");
          break;
        default:
          break;
      }
    } else {
      $toast.success("Changes were successfully saved!");
    }
  }
};

const save = async (dir: Direction) :Promise<boolean> => {
  if (!props.assignment) return false;

  const serializedAnnotations: any[] = serializeLSAnnotations();

  // serializedAnnotations.length === 1 because the document rating will always be there. (default=0)
  if (
    dir == Direction.NEXT &&
    !props.isEditor &&
    props.assignment.status !== "done" &&
    serializedAnnotations.length === 1 &&
    !confirm(
      "No annotations were made in this document.\nAre you sure you want to continue?"
    )
  ) {
    return false;
  }

  const pos_rating: number = serializedAnnotations.findIndex((x) => x.from_name == "doc_confidence");
  let rating: number = props.assignment.difficulty_rating;
  if (pos_rating >= 0) {
    rating = serializedAnnotations[pos_rating].value.rating;
  }

  await updateAnnotationsAndRelations(serializedAnnotations, rating);

  if(dir != Direction.PREVIOUS) {
    await $trpc.assignment.update.mutate({
      id: props.assignment.id,
      updates: {
        status: AssignmentStatuses.DONE,
        difficulty_rating: rating,
      },
    });
  }

  return true;
};

const updateAnnotationsAndRelations = async (serializedAnnotations: any[], assignmentRating: number) => {
  if (!props.assignment) return;

  // create annotations
  const ls_anns = [];
  for (let i = 0; i < serializedAnnotations.length; i++) {
    const ann = serializedAnnotations[i];
    if (ann.from_name == "label") {
      ls_anns.push(ann);
    } else {
      if (ls_anns.length > 0) {
        if(props.annotation_level != AnnotationLevels.DOCUMENT) {
          // assumes each confidence comes right after their respective labeled annotation
          // (so far it seems correct to assume this, based on LS sorting the annotations by Id)
          if (ann.from_name == "ann_confidence") {
            if (ann.id == ls_anns[ls_anns.length - 1].id) {
              ls_anns[ls_anns.length - 1].value.confidence_rating = ann.value.rating;
            }
          } 
        }
        else {
          ls_anns[ls_anns.length - 1].value.confidence_rating = assignmentRating;
        }
      }
    }
  }

  const db_anns = convert_annotation_ls2db(ls_anns, props.assignment?.id);

  const created_anns = await $trpc.annotation.updateAssignmentAnnotations.mutate({
    assignment_id: props.assignment?.id,
    annotations: db_anns,
  });

  if (!created_anns) return;

  // create relations
  const ls_rels = serializedAnnotations.filter((x) => x.type == "relation");

  ls_rels.map((rel) => {
    let from = -1;
    let to = -1;
    for (let i = 0; i < created_anns.length; ++i) {
      if (created_anns[i].ls_id == (rel as LSSerializedRelation).from_id)
        from = created_anns[i].id;

      if (created_anns[i].ls_id == (rel as LSSerializedRelation).to_id)
        to = created_anns[i].id;
    }
    $trpc.relation.create.mutate({
      fields: rel as LSSerializedRelation,
      from_id: from,
      to_id: to,
    });
  });
};

function waitForElement(selector: string): Promise<Element> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) {
      return resolve(el);
    }

    const observer = new MutationObserver((mutations) => {
      const ob_el = document.querySelector(selector);
      if (ob_el) {
        resolve(ob_el);
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

onMounted(() => {
  initLS();
  if (!showSideColumn.value) {
    waitForElement('.ls-common').then(
      (el) => {
        el.firstChild!.parentElement!.style.gridTemplateColumns = 'auto';
      }
    );
  }
});
</script>
<style>
#label-studio {
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.lsf-richtext {
  margin-top: 1.5rem;
}

.ant-input {
  position: sticky;
  top: 0;
  z-index: 1;
}

.lsf-label__text {
  white-space: pre-wrap;
  /* word-break: break-all; */
  user-select: none;
}

.lsf-label__hotkey {
  user-select: none;
}

.lsf-label {
  display: inline-table;
  margin: 0px 8px 8px 0px !important;
}

.ls-common,
.main-content-wrapper--1qjJ0,
.lsf-main-view {
  min-height: 0;
}

.lsf-main-view__annotation {
  padding: 0;
  height: 100%;
}

sup {
  display: none;
}

.ls-menu {
  overflow-y: auto;
}

.ant-rate-star-zero svg {
  color: #d2cece;
}
</style>
