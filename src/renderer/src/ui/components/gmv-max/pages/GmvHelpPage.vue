<script lang="ts">
// help page of the GMV MAX workspace. State and handlers come from TiktokGmvMaxOptimizerView via provide/inject.
import { defineComponent } from "vue";
import GmvMaxHelpCenter from "../GmvMaxHelpCenter.vue";
import { useGmvWorkspace } from "./workspaceContext";

export default defineComponent({
  name: "GmvHelpPage",
  components: { GmvMaxHelpCenter },
  setup() {
    return useGmvWorkspace();
  },
});
</script>

<template>
<section
  class="gmv-section gmv-section--help"
>
  <GmvMaxHelpCenter
    :current-issues="selectedSopIssues"
    :current-object="helpCurrentObject"
    :focus-issue-code="helpFocusIssueCode"
    @navigate="selectFeatureTab"
  />
</section>
</template>
