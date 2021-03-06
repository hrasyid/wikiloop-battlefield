// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const mongoose = require('mongoose');
module.exports = async (req, res) => {
    let myGaId = req.body.gaId || req.cookies._ga;

    // TO-FUTURE-DO consider adding pagination if performance is a problem. We don't expect this list to be more than
    // 10K records anytime soon
    let ret = await mongoose.connection.db.collection("Interaction").aggregate(
        [
            {
                "$match": {
                    "userGaId": { $ne: null }
                }
            },
            {
                "$group": {
                    "_id": {
                        "userGaId": "$userGaId"
                    },
                    "count": {
                        "$sum": 1
                    },
                    "lastTimestamp": {
                        "$max": "$timestamp"
                    }
                }
            },
            {
                "$sort": {
                    "count": -1
                }
            },
            {
                "$project": {
                    "userGaId": "$_id.userGaId",
                    "count": 1,
                    "lastTimestamp": 1
                }
            }
        ],
        {
            "allowDiskUse": false
        }
    ).toArray();
    res.send(ret);
    req.visitor
        .event({ ec: "api", ea: "/leaderboard" })
        .send();
};
