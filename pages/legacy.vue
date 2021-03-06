<!--
  Copyright 2019 Google LLC

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->
<!--eslint-disable-->
<template>

  <section>
    <div v-if="!loading" class="small-screen-padding">
      <h5>
        {{showCounter}} out of {{revisionCounter}} revisions matches <span
          class="btn btn-sm btn-outline-primary" v-b-modal.filter-modal>filters</span> or <span v-on:click="pause = !pause" class="btn btn-sm btn-outline-primary">pause</span> it.

      </h5>

      <div class="m-auto" v-if="newRecentChangDbIds.length === 0">
        <h1 class="m-auto">Please wait for the first vandal edit to show up....</h1>
      </div>
      <div
          v-for="newRecentChangDbId of newRecentChangDbIds"
          v-bind:key="newRecentChangDbId"
          class="col-12 p-2">
          <NewRevisionCard
            :wikiRevId="`${dbIdToRecentChangeMap[newRecentChangDbId].wiki}:${dbIdToRecentChangeMap[newRecentChangDbId].revision.new}`"
            ></NewRevisionCard>
      </div>
    </div>
    <div v-if="loading" class="container small-screen-padding d-flex justify-content-center" style="margin-top:60px">
      <div class="spinner-border" role="status">
        <span class="sr-only">Loading...</span>
      </div> Loading ... initial loading maybe a bit slow, it will come, eventually ...
    </div>
    <b-modal id="filter-modal" title="Filters">
      <b-form-group label="Require">
        <b-form-checkbox v-model="requireEnWiki">en-wiki</b-form-checkbox>
        <b-form-checkbox v-model="requireNonBot">non-bot</b-form-checkbox>
        <b-form-checkbox v-model="requireArticleNamespace">article namespace</b-form-checkbox>
        <b-form-checkbox v-model="requireBadfaith">bad-faith (by WMF ORES score)</b-form-checkbox>
        <b-form-checkbox v-model="requireDamaging">damaging (by WMF ORES score)</b-form-checkbox>
        <span for="thresold">Threshold: </span>
        <button v-on:click="changeThreshold(0.1)" class="btn btn-sm"><i class="fas fa-chevron-up"></i></button>
        <span id="thresold"> {{ threshold ? threshold.toFixed(2) : "(default)" }}</span>
        <button v-on:click="changeThreshold(-0.1)" class="btn btn-sm"><i class="fas fa-chevron-down"></i>
        </button>
        <button v-on:click="resetThreshold()" class="btn btn-sm"><i class="fas fa-sync-alt"></i></button>
      </b-form-group>
    </b-modal>
  </section>

</template>
<script>
  import socket from '~/plugins/socket.io.js';
  import BootstrapVue from 'bootstrap-vue';
  import NewRevisionCard from '~/components/NewRevisionCard.vue';
  import VueTimeago from 'vue-timeago';
  import utility from '../shared/utility';

  export default {
    comments: {
      BootstrapVue,
      VueTimeago
    },
    components: {
      NewRevisionCard
    },
    computed: {
      getRecentChange: function(dbId) {
        return this.dbIdToRecentChangeMap[dbId];
      }
    },
    data() {
      return {
        title: 'WikiLoop Battlefield',
        wikiRevIds:[],
        newRecentChangDbIds: [],
        dbIdToRecentChangeMap: {},
        bufferNewRecentChange: {},
        titleToDbIds: {},
        requireEnWiki: true,
        requireDamaging: true,
        requireBadfaith: true,
        requireArticleNamespace: true,
        requireNonBot: true,
        threshold: null,
        revisionCounter: 0,
        basicFilterCounter: 0,
        liveUserCount: 1,
        showCounter: 0,
        stale: false,
        pause: false,
        timer: null,
        loading: false,
        initRecentChanges: []
        // loaded: false
      }
    },
    async asyncData({$axios}) {
      const version = await $axios.$get(`/api/version`);
      const stats = await $axios.$get(`/api/stats`);
      return {version, stats};
    },
    methods: {
      refreshTimer: function() {
        clearTimeout(this.timer);
        this.timer = setTimeout(()=>{
          this.stale = true;
        }, 7000);  // we at least allow 1 new card each 7 seconds.
      },
      meetThreshold: function (newRecentChange) {
        if (this.stale || !('ores' in newRecentChange)) return true;
        else if (this.threshold !== null) {
          return (newRecentChange.ores.damagingScore >= this.threshold || !this.requireDamaging) &&
              (newRecentChange.ores.badfaithScore >= this.threshold || !this.requireBadfaith);
        } else {
          return (newRecentChange.ores.damaging || !this.requireDamaging) &&
              (newRecentChange.ores.badfaith || !this.requireBadfaith);
        }
      },
      resetThreshold: function () {
        this.threshold = null;
      },
      changeThreshold: function (change) {
        if (this.threshold === null) this.threshold = 0.7;
        this.threshold = (this.threshold + change);
        if (this.threshold >= 1.0) {
          this.threshold = 1.0;
        } else if (this.threshold <= 0) this.threshold = 0.0;
      },

      maybeShowRecentChange: async function (newRecentChange) {
        if (this.dbIdToRecentChangeMap[newRecentChange._id]) {
          // ignore existing recent change. - could be prefetched
          return;
        }
        let title = newRecentChange.title;
        if (this.titleToDbIds[title]) {
          let existingDbIds = this.titleToDbIds[title];
          for (let dbId of existingDbIds) {
            let recentChange = this.dbIdToRecentChangeMap[dbId];
            if (newRecentChange.timestamp > recentChange.timestamp) {
              recentChange.overriden = true;
            }
          }
        }

        this.revisionCounter++;
        if (
            (newRecentChange.namespace === 0 || !this.requireArticleNamespace) &&
            (newRecentChange.nonbot === true || !this.requireNonBot) &&
            (this.$store.state.wiki === newRecentChange.wiki || !this.requireEnWiki) &&
            this.meetThreshold(newRecentChange)
        ) {
          this.stale = false; // resets the stale
          this.showCounter++;
          await this.fetchDiffWithWikiRevId(newRecentChange.wikiRevId);
          this.dbIdToRecentChangeMap[newRecentChange._id] = newRecentChange;
          this.newRecentChangDbIds.unshift(newRecentChange._id); // TODO the list becomes larger and larger as time goes....
          if (!this.titleToDbIds[newRecentChange.title]) this.titleToDbIds[newRecentChange.title] = [];
          this.titleToDbIds[newRecentChange.title].push(newRecentChange._id);
          this.refreshTimer();

        } else {
          // Do nothing for not showing recent changes.
        }
      }
    },
    beforeMount() {
      this.getUrlBaseByWiki = utility.getUrlBaseByWiki.bind(this); // now you can call this.getUrlBaseByWiki() (in your functions/template)
      this.fetchDiffWithWikiRevId = utility.fetchDiffWithWikiRevId.bind(this); // now you can call this.fetchDiff() (in your functions/template)
    },
    async mounted() {
      var startTime = new Date();
      this.$ga.page('/index.vue'); // track page
      this.loading = true;

      socket.on('recent-change', async (newRecentChange) => {
        // This is a hack fix of an existing Vue caveat: a new data will not have "reactivity"
        // if not being added to Vue data. https://vuejs.org/v2/guide/list.html#Caveats
        // Related bug https://github.com/google/wikiloop-battlefield/issues/22
        // By assigning it to a Vue data, it gets reactivity and we are good. But it's a hack...
        this.bufferNewRecentChange = newRecentChange;
        await this.maybeShowRecentChange(this.bufferNewRecentChange);
      });
      socket.on('client-activity', async (clientActivity) => {
        console.log(`client activity: ${JSON.stringify(clientActivity)}`);
        this.liveUserCount = clientActivity.liveUserCount;
      });
      document.addEventListener('stats-update', async () => {
        console.log(`stats-update:`);
        this.stats = await this.$axios.$get(`/api/stats`);
      });

      this.$axios.$get(`/api/latestRevs?wiki=${this.$store.state.wiki}`).then((result) => {
        this.initRecentChanges = result;
        result.forEach((async (rc) => await this.maybeShowRecentChange(rc)));
        this.loading = false;

        var endTime = new Date();
        this.$ga.time("Initial Load Timing", "Client delay for /api/lastRevs", endTime.getTime() - startTime.getTime());
        console.log(`Initial Load delay for /api/latestRevs = ${endTime.getTime() - startTime.getTime()}`);

      });
    }
  }
</script>

<style>
</style>
