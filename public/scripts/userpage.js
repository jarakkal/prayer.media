/**
 * Copyright 2015 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

window.prayerMedia = window.prayerMedia || {};

/**
 * Handles the User Profile UI.
 */
prayerMedia.UserPage = class {

  /**
   * Initializes the user's profile UI.
   * @constructor
   */
  constructor() {
    // Firebase SDK.
    this.database = firebase.database();
    this.auth = firebase.auth();

    $(document).ready(() => {
      // DOM Elements.
      this.userPage = $('#page-user-info');
      this.userAvatar = $('.fp-user-avatar');
      this.toast = $('.mdl-js-snackbar');
      this.userUsername = $('.fp-user-username');
      this.userInfoContainer = $('.fp-user-container');
      this.followContainer = $('.fp-follow');
      this.noPosts = $('.fp-no-posts', this.userPage);
      this.followLabel = $('.mdl-switch__label', this.followContainer);
      this.followCheckbox = $('#follow');
      this.nbPostsContainer = $('.fp-user-nbposts', this.userPage);
      this.nbFollowers = $('.fp-user-nbfollowers', this.userPage);
      this.nbFollowing = $('.fp-user-nbfollowing', this.userPage);
      this.nbFollowingContainer = $('.fp-user-nbfollowing-container', this.userPage);
      this.followingContainer = $('.fp-user-following', this.userPage);
      this.nextPageButton = $('.fp-next-page-button button');
      this.closeFollowingButton = $('.fp-close-following', this.userPage);
      this.userInfoPageImageContainer = $('.fp-image-container', this.userPage);

      // Event bindings.
      this.followCheckbox.change(() => this.onFollowChange());
      this.auth.onAuthStateChanged(() => this.trackFollowStatus());
      this.nbFollowingContainer.click(() => this.displayFollowing());
      this.closeFollowingButton.click(() => {
        this.followingContainer.hide();
        this.nbFollowingContainer.removeClass('is-active');
      });
    });
  }

  /**
   * Triggered when the user changes the "Follow" checkbox.
   */
  onFollowChange() {
    const checked = this.followCheckbox.prop('checked');
    this.followCheckbox.prop('disabled', true);

    prayerMedia.firebase.toggleFollowUser(this.userId, checked);
  }

  /**
   * Starts tracking the "Follow" checkbox status.
   */
  trackFollowStatus() {
    if (this.auth.currentUser) {
      prayerMedia.firebase.registerToFollowStatusUpdate(this.userId, data => {
        this.followCheckbox.prop('checked', data.val() !== null);
        this.followCheckbox.prop('disabled', false);
        this.followLabel.text(data.val() ? 'Following' : 'Follow');
        prayerMedia.MaterialUtils.refreshSwitchState(this.followContainer);
      });
    }
  }

  /**
   * Adds the list of posts to the UI.
   */
  addPosts(posts) {
    const postIds = Object.keys(posts);
    for (let i = postIds.length - 1; i >= 0; i--) {
      this.userInfoPageImageContainer.append(
          prayerMedia.UserPage.createImageCard(postIds[i],
              posts[postIds[i]].thumb_url || posts[postIds[i]].url, posts[postIds[i]].text));
      this.noPosts.hide();
    }
  }

  /**
   * Shows the "load next page" button and binds it the `nextPage` callback. If `nextPage` is `null`
   * then the button is hidden.
   */
  toggleNextPageButton(nextPage) {
    if (nextPage) {
      this.nextPageButton.show();
      this.nextPageButton.unbind('click');
      this.nextPageButton.prop('disabled', false);
      this.nextPageButton.click(() => {
        this.nextPageButton.prop('disabled', true);
        nextPage().then(data => {
          this.addPosts(data.entries);
          this.toggleNextPageButton(data.nextPage);
        });
      });
    } else {
      this.nextPageButton.hide();
    }
  }

  /**
   * Displays the given user information in the UI.
   */
  loadUser(userId) {
    this.userId = userId;

    // Reset the UI.
    this.clear();

    // If users is the currently signed-in user we hide the "Follow" checkbox and the opposite for
    // the "Notifications" checkbox.
    if (this.auth.currentUser && userId === this.auth.currentUser.uid) {
      this.followContainer.hide();
      prayerMedia.messaging.enableNotificationsContainer.show();
      prayerMedia.messaging.enableNotificationsCheckbox.prop('disabled', true);
      prayerMedia.MaterialUtils.refreshSwitchState(prayerMedia.messaging.enableNotificationsContainer);
      prayerMedia.messaging.trackNotificationsEnabledStatus();
    } else {
      prayerMedia.messaging.enableNotificationsContainer.hide();
      this.followContainer.show();
      this.followCheckbox.prop('disabled', true);
      prayerMedia.MaterialUtils.refreshSwitchState(this.followContainer);
      // Start live tracking the state of the "Follow" Checkbox.
      this.trackFollowStatus();
    }

    // Load user's profile.
    prayerMedia.firebase.loadUserProfile(userId).then(snapshot => {
      const userInfo = snapshot.val();
      if (userInfo) {
        this.userAvatar.css('background-image',
            `url("${userInfo.profile_picture || '/images/silhouette.jpg'}")`);
        this.userUsername.text(userInfo.full_name || 'Anonymous');
        this.userInfoContainer.show();
      } else {
        var data = {
          message: 'This user does not exists.',
          timeout: 5000
        };
        this.toast[0].MaterialSnackbar.showSnackbar(data);
        page(`/feed`);
      }
    });

    // Lod user's number of followers.
    prayerMedia.firebase.registerForFollowersCount(userId,
        nbFollowers => this.nbFollowers.text(nbFollowers));

    // Lod user's number of followed users.
    prayerMedia.firebase.registerForFollowingCount(userId,
        nbFollowed => this.nbFollowing.text(nbFollowed));

    // Lod user's number of posts.
    prayerMedia.firebase.registerForPostsCount(userId,
        nbPosts => this.nbPostsContainer.text(nbPosts));

    // Display user's posts.
    prayerMedia.firebase.getUserFeedPosts(userId).then(data => {
      const postIds = Object.keys(data.entries);
      if (postIds.length === 0) {
        this.noPosts.show();
      }
      prayerMedia.firebase.subscribeToUserFeed(userId,
        (postId, postValue) => {
          this.userInfoPageImageContainer.prepend(
              prayerMedia.UserPage.createImageCard(postId,
                  postValue.thumb_url || postValue.url, postValue.text));
          this.noPosts.hide();
        }, postIds[postIds.length - 1]);

      // Adds fetched posts and next page button if necessary.
      this.addPosts(data.entries);
      this.toggleNextPageButton(data.nextPage);
    });

    // Listen for posts deletions.
    prayerMedia.firebase.registerForPostsDeletion(postId =>
        $(`.fp-post-${postId}`, this.userPage).remove());
  }

  /**
   * Displays the list of followed people.
   */
  displayFollowing() {
    prayerMedia.firebase.getFollowingProfiles(this.userId).then(profiles => {
      // Clear previous following list.
      $('.fp-usernamelink', this.followingContainer).remove();
      // Display all following profile cards.
      Object.keys(profiles).forEach(uid => this.followingContainer.prepend(
          prayerMedia.UserPage.createProfileCardHtml(
              uid, profiles[uid].profile_picture, profiles[uid].full_name)));
      if (Object.keys(profiles).length > 0) {
        this.followingContainer.show();
        // Mark submenu as active.
        this.nbFollowingContainer.addClass('is-active');
      }
    });
  }

  /**
   * Clears the UI and listeners.
   */
  clear() {
    // Removes all pics.
    $('.fp-image', this.userInfoPageImageContainer).remove();

    // Remove active states of sub menu selectors (like "Following").
    $('.is-active', this.userInfoPageImageContainer).removeClass('is-active');

    // Cancel all Firebase listeners.
    prayerMedia.firebase.cancelAllSubscriptions();

    // Hides the "Load Next Page" button.
    this.nextPageButton.hide();

    // Hides the user info box.
    this.userInfoContainer.hide();

    // Hide and empty the list of Followed people.
    this.followingContainer.hide();
    $('.fp-usernamelink', this.followingContainer).remove();

    // Stops then infinite scrolling listeners.
    prayerMedia.MaterialUtils.stopOnEndScrolls();

    // Hide the "No posts" message.
    this.noPosts.hide();
  }

  /**
   * Returns an image Card element for the image with the given URL.
   */
  static createImageCard(postId, thumbUrl, text) {
    const element = $(`
          <a href="/post/${postId}" class="fp-post-${postId} fp-image mdl-cell mdl-cell--12-col mdl-cell--4-col-tablet
                                            mdl-cell--4-col-desktop mdl-grid mdl-grid--no-spacing">
              <div class="fp-overlay">
                  <i class="material-icons">favorite</i><span class="likes">0</span>
                  <i class="material-icons">mode_comment</i><span class="comments">0</span>
                  <div class="fp-pic-text">${text}</div>
              </div>
              <div class="mdl-card mdl-shadow--2dp mdl-cell
                          mdl-cell--12-col mdl-cell--12-col-tablet mdl-cell--12-col-desktop"></div>
          </a>`);
    // Display the thumbnail.
    $('.mdl-card', element).css('background-image', `url("${thumbUrl.replace(/"/g, '\\"')}")`);
    // Start listening for comments and likes counts.
    prayerMedia.firebase.registerForLikesCount(postId,
        nbLikes => $('.likes', element).text(nbLikes));
    prayerMedia.firebase.registerForCommentsCount(postId,
        nbComments => $('.comments', element).text(nbComments));

    return element;
  }

  /**
   * Returns an image Card element for the image with the given URL.
   */
  static createProfileCardHtml(uid, profilePic = '/images/silhouette.jpg', fullName = 'Anonymous') {
    return `
        <a class="fp-usernamelink mdl-button mdl-js-button" href="/user/${uid}">
            <div class="fp-avatar" style="background-image: url('${profilePic}')"></div>
            <div class="fp-username mdl-color-text--black">${fullName}</div>
        </a>`;
  }
};

prayerMedia.userPage = new prayerMedia.UserPage();
