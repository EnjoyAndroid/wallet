import React from 'react';
import { connect } from 'react-redux'
import { BackHandler, ImageBackground, Dimensions,NativeModules, Image, Modal, ScrollView, DeviceEventEmitter, 
         InteractionManager, ListView, StyleSheet, View, RefreshControl, Text, WebView, FlatList, Platform,
         Clipboard, TouchableHighlight, Linking, TouchableOpacity,NativeEventEmitter } from 'react-native';
import { TabViewAnimated, TabBar, SceneMap } from 'react-native-tab-view';
import { Eos } from "react-native-eosjs";
import {formatEosQua} from '../../utils/FormatUtil'
import moment from 'moment';
import UImage from '../../utils/Img'
import UColor from '../../utils/Colors'
import Swiper from 'react-native-swiper';
import Button from '../../components/Button'
import Constants from '../../utils/Constants'
import ScreenUtil from '../../utils/ScreenUtil'
import { EasyToast } from '../../components/Toast';
import AnalyticsUtil from '../../utils/AnalyticsUtil';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Carousel from 'react-native-banner-carousel';
require('moment/locale/zh-cn');


const pages = [];
let loadMoreTime = 0;
let currentLoadMoreTypeId;
var ScreenWidth = Dimensions.get('window').width;
var ScreenHeight = Dimensions.get('window').height;
var cangoback = false;
var ITEM_HEIGHT = 100;

var AES = require("crypto-js/aes");
var CryptoJS = require("crypto-js");
var DeviceInfo = require('react-native-device-info');
let g_props;
let g_CallToRN = {methodName:"",callback:""}; //记录上次监听到的SDK方法和回调函数名
var IosSDKModule = NativeModules.IosSDKModule;

@connect(({ banner, newsType, news, wallet,vote}) => ({ ...banner, ...newsType, ...news, ...wallet , ...vote}))
class News extends React.Component {

  static navigationOptions = {
    tabBarLabel: '资讯',
    tabBarIcon: ({ focused}) => (
      <Image resizeMode='stretch'
          source={focused ? UImage.tab_3_h : UImage.tab_3} style={{width: ScreenUtil.autowidth(20), height: ScreenUtil.autowidth(20),}}
      />
    ),
    header: null,
  };
  
  constructor(props) {
    super(props);
    this.state = {
      index: 0,
      h: ScreenWidth * 0.436,
      dataSource: new ListView.DataSource({ rowHasChanged: (row1, row2) => row1 !== row2 }),
      routes: [{ key: '', title: '' }],
      theme: false,    //白色版
      dappPromp: false,
      selecttitle:"",
      selecturl:"",
      dappList: [],
      holdallList: [
        {icon: UImage.ManualSearch,name:'手动搜索DAPP',description:'手动搜索DAPP,可添加到收藏夹'},
        {icon: UImage.eospark,name:'eospark',description:'eos区块浏览器'},
        {icon: UImage.Freemortgage,name:'免费抵押',description:'免费抵押：计算资源,网络资源'},
      ],
      periodstext: '', //当前进行第几期活动
      periodsseq: '', //当前进行第几期下标
    };
    g_props = props;    
  }

  //组件加载完成
  componentDidMount() {
    this.props.dispatch({ type: 'wallet/info', payload: { address: "1111" }, callback: () => {
      this.props.dispatch({ type: 'wallet/walletList', payload: {}, callback: (walletArr) => {
        if(walletArr == null || walletArr.length == 0){
          this.props.dispatch({ type: 'wallet/updateGuideState', payload: {guide: true}});
          return;
        }else{
          this.props.dispatch({ type: 'wallet/updateGuideState', payload: {guide: false}});
        }
      }
      });
    } });
    //页面加载先去获取一次ET快讯
    this.props.dispatch({ type: 'news/list', payload: { type: '12', page: 1, newsRefresh: false } });
    //切换tab完成后执行,不影响ui流畅度
    InteractionManager.runAfterInteractions(() => {
      let i = 0;
      if (this.props.types && this.props.types.length > 0) {
        this.props.types.map((route) => {
          if (i == 0) {
            //加载新闻
            this.props.dispatch({ type: 'news/list', payload: { type: route.key, page: 1, newsRefresh: false } });
            pages.push(1);
          } else {
            pages.push(0);
          }
          i++;
        });
        this.setState({
          routes: this.props.types
        });
      }
    });
    BackHandler.addEventListener('hardwareBackPress', this.onBackAndroid);

    this.props.dispatch({type:'login/getthemeSwitching',callback:(theme)=>{
      if(!theme.theme){  
        //白色版
        this.setState({theme:false});
      }else{
        this.setState({theme:true});
      }
    }});
    try {
      // this.setState({assetRefreshing: true});
      this.props.dispatch({ type: 'wallet/dappfindAllRecommend', callback: (resp) => {
          if (resp && resp.code == '0') {
            if(resp.data && resp.data.length > 0){
              this.setState({dappList : resp.data});
            }
          } else {
            console.log("dappfindAllRecommend error");
          }
          // this.setState({assetRefreshing: false});
      } });
    } catch (error) {
      console.log("dappfindAllRecommend error: %s",error.message);
      // this.setState({assetRefreshing: false});
    }

    //监听原生页面的消息
    if(Platform.OS === 'ios'){
      this.listener=null;
      let eventEmitter = new NativeEventEmitter(IosSDKModule);
      this.listener = eventEmitter.addListener("IosEventName", (obj) => {
        try {

          if(g_CallToRN.methodName == obj.methodName)
          {
              if(obj.callback && (g_CallToRN.callback == obj.callback))
              {
                //同一个方法，同一个回调函数，重复消息拒绝掉
                IosSDKModule.iosDebugInfo("相同消息");
                return;
              }
          }
          g_CallToRN.methodName = obj.methodName;
          g_CallToRN.callback = obj.callback;
          callMessage(obj.methodName,obj.params,obj.password,obj.device_id,obj.callback);
        } catch (error) {
          IosSDKModule.iosDebugInfo("错误信息:"+error.message);
          console.log("event CallToRN error: %s",error.message);
        }

      }) 
  }else if(Platform.OS === 'android'){
    DeviceEventEmitter.addListener('CallToRN', (data) => {
        if(data){
           try {
            var obj = JSON.parse(data);
            if(g_CallToRN.methodName == obj.methodName)
            {
                if(obj.callback && (g_CallToRN.callback == obj.callback))
                {
                  //同一个方法，同一个回调函数，重复消息拒绝掉
                  return;
                }
            }
            g_CallToRN.methodName = obj.methodName;
            g_CallToRN.callback = obj.callback;
            callMessage(obj.methodName,obj.params,obj.password,obj.device_id,obj.callback);
           } catch (error) {
            console.log("event CallToRN error: %s",error.message);
           }
        }
      });

    }

    this.props.dispatch({type: 'news/getActivityStages', payload:{activityId:"1"},callback: (periodsdata) => {
        try {
          let periodstext= '';
          let periodsseq= '';
          for(var i = 0; i < periodsdata.length; i++){
              if(periodsdata[i].status == 'doing'){
                  periodstext= periodsdata[i].name;
                  periodsseq= periodsdata[i].seq;
              }
          }
          this.setState({periodstext:periodstext,periodsseq:periodsseq});
        } catch (error) {
          
        }
    } })
  }

  componentWillUnmount() {
    if(Platform.OS === 'ios')
    {
      this.listener && this.listener.remove();
    }
    else if(Platform.OS === 'android')
    {
      DeviceEventEmitter.removeListener('CallToRN');
    }
  }

  onBackAndroid = () => {
    if (cangoback) {
      let type = this.state.routes[this.state.index]
      let w = this.web[type.key];
      if (w) {
        w.goBack();
        return true;
      }
    }
  }

  //获得typeid坐标
  getRouteIndex(typeId) {
    for (let i = 0; i < this.props.types.length; i++) {
      if (this.props.types[i].key == typeId) {
        return i;
      }
    }
  }

  getCurrentRoute() {
    return this.props.types[this.state.index];
  }

  //加载更多
  onEndReached(typeId) {
    pages[index] += 1;
    currentLoadMoreTypeId = typeId;
    const time = Date.parse(new Date()) / 1000;
    const index = this.getRouteIndex(typeId);
    if (time - loadMoreTime > 1) {
      pages[index] += 1;
      this.props.dispatch({ type: 'news/list', payload: { type: typeId, page: pages[index] } });
      loadMoreTime = Date.parse(new Date()) / 1000;
    }
  };

  //下拉刷新
  onRefresh = (typeId, refresh) => {
    //加载广告
    if (!this.props.banners || this.props.banners.length == 0) {
      this.props.dispatch({ type: 'banner/list', payload: {} });
    }

    this.props.dispatch({ type: 'news/list', payload: { type: typeId, page: 1, newsRefresh: refresh } });
    const index = this.getRouteIndex(typeId);
    if (index >= 0) {
      pages[index] = 1;
    }
  };

  //点击新闻
  onPress = (news) => {
    AnalyticsUtil.onEvent('click_Journalism');
    let route = this.getCurrentRoute();
    if (route.type == 2) {
      this.props.dispatch({ type: 'news/openView', payload: { key: route.key, nid: news.id } });

    } else {
      const { navigate } = this.props.navigation;
      this.props.dispatch({ type: 'news/view', payload: { news: news } });
      if (news && news.url && news.url != "") {
        let url = news.url.replace(/^\s+|\s+$/g, "");
        navigate('Web', { title: news.title, url: url, news });
      }
    }
  };

  onDown = (news) => {
    this.props.dispatch({ type: 'news/down', payload: { news: news } });
    AnalyticsUtil.onEvent('step_on');
  }

  onUp = (news) => {
    this.props.dispatch({ type: 'news/up', payload: { news: news } });
    AnalyticsUtil.onEvent('Fabulous');
  }

  onShare = (news) => {
    this.props.dispatch({ type: 'news/share', payload: { news: news } });
    DeviceEventEmitter.emit('share', news);
    AnalyticsUtil.onEvent('Forward');
  }

  bannerPress = (banner) => {
    if (banner && banner.url && banner.url != "") {
      const { navigate } = this.props.navigation;
      let url = banner.url.replace(/^\s+|\s+$/g, "");
      navigate('Web', { title: banner.title, url: url });
      if(banner.id== '40'){
        navigate('OTCactivity',{ periodstext:this.state.periodstext, periodsseq:this.state.periodsseq });
      }
    }
  }

  //切换tab
  _handleIndexChange = index => {
    if (pages[index] <= 0) {
      let type = this.state.routes[index]
      InteractionManager.runAfterInteractions(() => {
        this.onRefresh(type.key, false);
      });
    }
    this.setState({ index });
  };

  _handleTabItemPress = ({ route }) => {
    const index = this.getRouteIndex(route.key);
    this.setState({
      index
    });
  }

  webChange = (e) => {
    cangoback = e.canGoBack;
  }


  openSystemSetting(){
    // console.log("go to set net!")
    if (Platform.OS == 'ios') {
      Linking.openURL('app-settings:')
        .catch(err => console.log('error', err))
    } else {
      NativeModules.OpenSettings.openNetworkSettings(data => {
        console.log('call back data', data)
      })
    }
  }

  onPressDapp(data) {
    this.setState({
      dappPromp: true,
      selecttitle:data.name,
      selecturl: data.url
    });
  }

  _setModalVisible_DAPP() {  
    let dappPromp = this.state.dappPromp;  
    this.setState({  
        dappPromp:!dappPromp,  
    });  
  } 

  openTokenissue_DAPP() {
    this. _setModalVisible_DAPP();
    if(Platform.OS === 'ios'){
      // let dict = {url:"http://eosbao.io/pocket?tokenpocket=true&referrer=eosgogogo", title: this.state.selecttitle};
      let dict = {url:this.state.selecturl, title: this.state.selecttitle, theme:""+this.state.theme};
      // IosSDKModule.iosDebugInfo(dict);
      IosSDKModule.openDapps(dict);
      
    }else if(Platform.OS === 'android'){
      NativeModules.SDKModule.startActivityFromReactNative(this.state.selecturl,this.state.selecttitle,this.state.theme);
    }
}

  onPressTool(dappdata) {
    const { navigate } = this.props.navigation;
    if(data.name == this.state.holdallList[0].name){
      navigate('Dappsearch', {});
    }else if(data.name == this.state.holdallList[1].name){
      navigate('FreeMortgage');
    }else if(data.name == this.state.holdallList[2].name){
      navigate('Web', { title: 'eospark', url: "https://eospark.com" });
    }else{
      EasyShowLD.dialogShow("温馨提示", "该功能正在紧急开发中，敬请期待！", "知道了", null, () => { EasyShowLD.dialogClose() });
    }
  }

  onAddto = (dappdata) =>{
    const c = this.props.navigation.state.params.coins;
    if(this.props.coinSelf && this.props.coinSelf[c.name.toLowerCase()]==1){
      this.props.dispatch({type:'news/doCoinSelf',payload:{action:"rem",name:dappdata.name.toLowerCase()},callback:function(){
        DeviceEventEmitter.emit('coinSlefChange',"");
      }});
      this.props.navigation.setParams({img:UImage.fav,onPress:this.onPress});
      EasyToast.show("已取消自选")
    }else{
      this.props.dispatch({type:'news/doCoinSelf',payload:{action:"add",name:dappdata.name.toLowerCase()},callback:function(){
        DeviceEventEmitter.emit('coinSlefChange',"");
      }});
      this.props.navigation.setParams({img:UImage.fav_h,onPress:this.onPress});
      EasyToast.show("已加入自选")
    }
  }

  //渲染页面
  renderScene = ({ route }) => {
    if (route.key == '') {
      return (<View></View>)
    }
    //if (route.key == this.state.routes[0].key) { 当tab的第一个是DAPP的时候释放这里
    if (route.title == 'DAPP') {   //现在暂时点击到官方公告时显示
      return (<View>
        <ScrollView  keyboardShouldPersistTaps="always">
          <View style={{ height: this.state.h }}>
            <Carousel autoplay autoplayTimeout={5000} loop index={0} pageSize={ScreenWidth}>
              {this.renderSwipeView()}
            </Carousel>
          </View>
          <View style={{backgroundColor: UColor.mainColor}}>
            {/* <View style={{marginHorizontal: ScreenUtil.autowidth(5),marginVertical:ScreenUtil.autoheight(10),borderLeftWidth: ScreenUtil.autoheight(3),borderLeftColor: UColor.tintColor,}}>  
              <Text style={{fontSize: ScreenUtil.setSpText(18),color:UColor.fontColor,paddingLeft: ScreenUtil.autoheight(12) }}>常用DAPP</Text>
            </View>
            <ListView  enableEmptySections={true}  contentContainerStyle={[styles.selflist,{borderBottomColor:UColor.secdColor}]}
              dataSource={this.state.dataSource.cloneWithRows(this.state.dappList == null ? [] : this.state.dappList)} 
              renderRow={(rowData) => (  
                <Button  onPress={this.onPressDapp.bind(this, rowData)}  style={styles.selfDAPP}>
                    <View style={styles.selfbtnout}>
                      <Image source={{uri:rowData.icon}} style={styles.selfBtnDAPP} />
                      <Text style={[styles.headbtntext,{color: UColor.fontColor}]} >{rowData.name}</Text>
                    </View>
                </Button>
              )}                
            />  */}
            <View style={{marginHorizontal: ScreenUtil.autowidth(5),marginVertical:ScreenUtil.autoheight(10),borderLeftWidth: ScreenUtil.autoheight(3),borderLeftColor: UColor.tintColor,}}>  
              <Text style={{fontSize: ScreenUtil.setSpText(18),color:UColor.fontColor,paddingLeft: ScreenUtil.autoheight(12) }}>工具箱</Text>
            </View> 
            <ListView  enableEmptySections={true}  contentContainerStyle={[styles.listViewStyle,{borderBottomColor:UColor.secdColor}]}
              dataSource={this.state.dataSource.cloneWithRows(this.state.holdallList == null ? [] : this.state.holdallList)} 
              renderRow={(rowData) => (  
                <Button  onPress={this.onPressTool.bind(this, rowData)}  style={styles.headDAPP}>
                  <View style={styles.headbtnout}>
                    <Image source={rowData.icon} style={styles.imgBtnDAPP} />
                    <View style={{flex: 1}}>
                      <Text style={[styles.headbtntext,{color: UColor.fontColor}]}>{rowData.name}</Text>
                      <Text style={[styles.headbtntext,{color: UColor.arrow}]} numberOfLines={1}>{rowData.description}</Text>
                    </View>
                  </View>
                </Button>
              )}                
            /> 
            <View style={{marginHorizontal: ScreenUtil.autowidth(5),marginVertical:ScreenUtil.autoheight(10),borderLeftWidth: ScreenUtil.autoheight(3),borderLeftColor: UColor.tintColor,}}>  
              <Text style={{fontSize: ScreenUtil.setSpText(18),color:UColor.fontColor,paddingLeft: ScreenUtil.autoheight(12) }}>游戏娱乐</Text>
            </View>
            <ListView  enableEmptySections={true}  contentContainerStyle={[styles.listViewStyle,{borderBottomColor:UColor.secdColor}]}
              dataSource={this.state.dataSource.cloneWithRows(this.state.dappList == null ? [] : this.state.dappList)} 
              renderRow={(rowData) => (  
                <Button  onPress={this.onPressDapp.bind(this, rowData)}  style={styles.headDAPP}>
                  <View style={styles.headbtnout}>
                    <Image source={{uri:rowData.icon}} style={styles.imgBtnDAPP} />
                    <View style={{flex: 1}}>
                      <Text style={[styles.headbtntext,{color: UColor.fontColor}]}>{rowData.name}</Text>
                      <Text style={[styles.headbtntext,{color: UColor.arrow}]} numberOfLines={1}>{rowData.description}</Text>
                    </View>
                  </View>
                </Button>
              )}                
            /> 
          </View>
          <Modal style={styles.touchableouts} animationType={'none'} transparent={true}  visible={this.state.dappPromp} onRequestClose={()=>{}}>
            <TouchableOpacity style={[styles.pupuoBackup,{backgroundColor: UColor.mask}]} activeOpacity={1.0}>
              <View style={{ width: ScreenWidth-30, backgroundColor: UColor.btnColor, borderRadius: 5, position: 'absolute', }}>
                <View style={styles.subViewBackup}> 
                  <Button onPress={this._setModalVisible_DAPP.bind(this) } style={styles.buttonView2}>
                    <Ionicons style={{ color: UColor.baseline}} name="ios-close-outline" size={30} />
                  </Button>
                </View>
                <Text style={styles.contentText}>您接下来访问的页面将跳转至第三方应用DAPP {this.state.selecttitle}</Text>
                <View style={[styles.warningout,{borderColor: UColor.showy}]}>
                    <View style={{flexDirection: 'row',alignItems: 'center',}}>
                      <Image source={UImage.warning_h} style={styles.imgBtnBackup} />
                      <Text style={[styles.headtext,{color: UColor.riseColor}]} >免责声明</Text>
                    </View>
                    <Text style={[styles.headtitle,{color: UColor.showy}]}>注意：您接下来访问的页面将跳转至第三方应用DAPP {this.state.selecttitle}。您在此应用上的所有行为应遵守该应用的用户协议和隐私政策，
                      并由DAPP {this.state.selecttitle}向您承担应有责任。</Text>
                </View>
                <Button onPress={this.openTokenissue_DAPP.bind(this)}>
                    <View style={[styles.deleteout,{backgroundColor: UColor.tintColor}]}>
                      <Text style={[styles.deletetext,{color: UColor.btnColor}]}>我已阅读并同意</Text>
                    </View>
                </Button>  
              </View> 
            </TouchableOpacity>
          </Modal>
        </ScrollView>
      </View>)
    }
    if (route.type == 1) {
      let url = route.url ? route.url.replace(/^\s+|\s+$/g, "") : "";
      const w = (<WebView
        ref={(c) => {
          if (!this.web) {
            this.web = {};
          }
          this.web[route.key] = c;
        }}
        source={{ uri: url }}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        onNavigationStateChange={(e) => { this.webChange(e) }}
      />
      )
      return w;
    }
    const v = (
      <ListView initialListSize={5}  style={{ backgroundColor: UColor.secdColor }} enableEmptySections={true} onEndReachedThreshold={20}
        renderSeparator={(sectionID, rowID) => <View key={`${sectionID}-${rowID}`} style={{ height: 1, backgroundColor: UColor.secdColor }} />}
        onEndReached={() => this.onEndReached(route.key)}
        renderHeader = {()=><View style={{ height: this.state.h }}>
        {Constants.isNetWorkOffline &&
          <Button onPress={this.openSystemSetting.bind(this)}>
            <View style={[styles.systemSettingTip,{backgroundColor: UColor.showy}]}>
                <Text style={[styles.systemSettingText,{color: UColor.btnColor}]}> 您当前网络不可用，请检查系统网络设置是否正常。</Text>
                <Ionicons style={[styles.systemSettingArrow,{color: UColor.fontColor}]} name="ios-arrow-forward-outline" size={20} />
            </View>
          </Button>}
          {/* <Swiper height={this.state.h} loop={true} autoplay={true} horizontal={true} autoplayTimeout={5} 
            paginationStyle={{ bottom: ScreenUtil.autoheight(10) }}
            dotStyle={{ backgroundColor: 'rgba(255,255,255,.2)', width: ScreenUtil.autowidth(6), height: ScreenUtil.autowidth(6) }}
            activeDotStyle={{ backgroundColor: UColor.tintColor, width: ScreenUtil.autowidth(6), height: ScreenUtil.autowidth(6) }}>
            {this.renderSwipeView()}
          </Swiper> */}
          <Carousel autoplay autoplayTimeout={5000} loop index={0} pageSize={ScreenWidth}>
            {this.renderSwipeView()}
          </Carousel>
        </View>
        }
        refreshControl={<RefreshControl refreshing={this.props.newsRefresh} onRefresh={() => this.onRefresh(route.key, true)}
          tintColor={UColor.fontColor} colors={[UColor.tintColor]} progressBackgroundColor={UColor.btnColor}/>}
        dataSource={this.state.dataSource.cloneWithRows(this.props.newsData[route.key] == null ? [] : this.props.newsData[route.key])}
        renderRow={(rowData) => (
          <TouchableHighlight onPress={() => { this.onPress(rowData) }} onLongPress={this.onShare.bind(this, rowData)} activeOpacity={0.5} underlayColor={UColor.secdColor}>
            <View style={[styles.row,{backgroundColor: UColor.mainColor}]}>
              <Text style={{ fontSize: ScreenUtil.setSpText(16), color: UColor.fontColor,fontWeight: "bold"}}>{rowData.title}</Text>
              {route.type == 2 && <Text numberOfLines={rowData.row} style={[styles.journalism,{color: UColor.lightgray}]} >{rowData.content}</Text>}
              {route.type == 2 && rowData.row == 3 && <Text style={[styles.moretext,{color: UColor.tintColor}]}>展开更多</Text>}
              {route.type != 2 && <Text style={[styles.journalism,{color: UColor.lightgray}]}>{rowData.content}</Text>}
              <View style={styles.rowFooter}>
                <Text style={[styles.pastTime,{color: UColor.lightgray}]}>{moment(rowData.createdate).fromNow()}</Text>
                <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}>
                  <Button onPress={this.onUp.bind(this, rowData)}>
                    <View style={styles.spotout}>
                      <Image style={styles.updownimg} source={rowData.isUp ? UImage.up_h : UImage.up} />
                      <Text style={[styles.updowntext,{color: rowData.isUp ? UColor.tintColor : UColor.lightgray}]}>{rowData.up}</Text>
                    </View>
                  </Button>
                  <Button onPress={this.onDown.bind(this, rowData)}>
                    <View style={styles.spotout}>
                      <Image style={styles.updownimg} source={rowData.isDown ? UImage.down_h : UImage.down} />
                      <Text style={[styles.updowntext,{color: rowData.isDown ? UColor.tintColor : UColor.lightgray}]}>{rowData.down}</Text>
                    </View>
                  </Button>
                  <Button onPress={this.onShare.bind(this, rowData)}>
                    <View style={styles.spotout}>
                      <Image style={{width:ScreenUtil.autowidth(22),height:ScreenUtil.autowidth(22)}} source={UImage.share_bright} />
                    </View>
                  </Button>
                </View>
              </View>
            </View>
          </TouchableHighlight>
        )} 
      />
    );
    return (v);
  }

  renderSwipeView() {
    if (this.props.banners != null) {
      return this.props.banners.map((item, i) => {
        return (<Button key={i} onPress={this.bannerPress.bind(this, item)}>
          <Image style={styles.image} key={item} source={{ uri: item.img, width: ScreenWidth }} resizeMode="cover"/>
        </Button>)
      })
    } else {
      return (<View></View>)
    }
  }
  render() {
    return (
      <View style={[styles.container,{backgroundColor: UColor.secdColor}]}>
        {this.state.routes && <TabViewAnimated 
            lazy={true} navigationState={this.state}
            renderScene={this.renderScene.bind(this)}
            renderHeader={(props) => <ImageBackground source={UImage.coinsbg1} resizeMode="stretch"  style={{width:ScreenWidth,height:ScreenWidth*0.1546,}}>
            <TabBar onTabPress={this._handleTabItemPress} 
            labelStyle={[styles.labelStyle,{color:UColor.btnColor}]} 
            indicatorStyle={[styles.indicatorStyle,{width: ScreenWidth / this.state.routes.length - ScreenUtil.autowidth(40),backgroundColor: UColor.fonttint}]} 
            style={[{paddingTop: ScreenUtil.isIphoneX() ? ScreenUtil.autoheight(25) : ScreenUtil.autoheight(20),alignItems: 'center',justifyContent: 'center',backgroundColor:UColor.transport}]} 
            tabStyle={{ width: ScreenWidth / this.state.routes.length, padding: 0, margin: 0 }} 
            scrollEnabled={true} {...props} />
            </ImageBackground>}
            onIndexChange={this._handleIndexChange}
            initialLayout={{ height: 0, width: ScreenWidth }}
          />
        }
      </View>
    );
  }
}

const styles = StyleSheet.create({
  selflist:{ 
    flexWrap:'wrap', 
    flexDirection:'row', 
    alignItems:'center', 
    width: ScreenWidth, 
    marginTop:ScreenUtil.autoheight(10),
    borderBottomWidth: 1,
  }, 
  selfDAPP: {
    width: ScreenWidth/4,
    paddingBottom: ScreenUtil.autoheight(10),
  },
  selfbtnout: {
    flex:1, 
    alignItems: 'center', 
    justifyContent: "center",
  },
  selfBtnDAPP: { 
    width: ScreenUtil.autowidth(40),
    height: ScreenUtil.autoheight(40),
    margin: ScreenUtil.autowidth(5),
  },
  listViewStyle:{ 
    flexDirection:'column', 
    width: ScreenWidth, 
    borderBottomWidth: 1,
  }, 
  headDAPP: {
    paddingBottom: ScreenUtil.autoheight(10),
    paddingHorizontal: ScreenUtil.autowidth(8),
  },
  headbtnout: {
    flexDirection: 'row',
    alignItems: 'center', 
    justifyContent: "center",
  },
  imgBtnDAPP: { 
    width: ScreenUtil.autowidth(40),
    height: ScreenUtil.autoheight(40),
    marginHorizontal: ScreenUtil.autowidth(15),
  },
  headbtntext: {
    fontSize: ScreenUtil.setSpText(12),
    lineHeight: ScreenUtil.autoheight(20), 
  },
  adddeleimg: {
    width: ScreenUtil.autowidth(25),
    height: ScreenUtil.autoheight(25),
  },
  pupuoBackup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subViewBackup: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: ScreenUtil.autoheight(30),
    width: ScreenWidth - ScreenUtil.autowidth(30),
  },
  buttonView2: {
    alignItems: 'center',
    justifyContent: 'center',
    width: ScreenUtil.autowidth(30),
  },
  contentText: {
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: ScreenUtil.setSpText(18),
    paddingBottom: ScreenUtil.autoheight(5),
  },
  warningout: {
    borderWidth: 1,
    borderRadius: 5,
    flexDirection: "column",
    alignItems: 'center',
    padding: ScreenUtil.autowidth(5),
    marginHorizontal: ScreenUtil.autowidth(15),
  },
  imgBtnBackup: {
    width: ScreenUtil.autowidth(25),
    height: ScreenUtil.autoheight(25),
    marginRight: ScreenUtil.autowidth(10),
  },
  headtext: {
    fontWeight: "bold",
    fontSize: ScreenUtil.setSpText(16), 
  },
  headtitle: {
    fontSize: ScreenUtil.setSpText(14),
    lineHeight: ScreenUtil.autoheight(20),
  },
  deleteout: {
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    height: ScreenUtil.autoheight(40),
    marginHorizontal: ScreenUtil.autowidth(100),
    marginVertical: ScreenUtil.autoheight(15),
  },
  deletetext: {
    fontSize: ScreenUtil.setSpText(16),
  },
  labelStyle: {
    margin: 0, 
    fontSize: ScreenUtil.setSpText(15), 
  },
  indicatorStyle: {
    marginLeft: ScreenUtil.autowidth(20),
    marginBottom: ScreenUtil.autoheight(1),
  },
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  row: {
    flex: 1,
    flexDirection: "column",
    paddingTop: ScreenUtil.autoheight(10),
    paddingHorizontal: ScreenUtil.autowidth(15),
  },
  rowFooter: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: ScreenUtil.autoheight(10),
  },
  systemSettingTip: {
    width: ScreenWidth,
    flexDirection: "row",
    alignItems: 'center', 
    height: ScreenUtil.autoheight(40),
  },
  systemSettingText: {
    flex: 1,
    textAlign: 'center',
    fontSize: ScreenUtil.setSpText(14),
  },
  systemSettingArrow: {
    marginRight: ScreenUtil.autowidth(5),
  },

  journalism: {
    fontSize: ScreenUtil.setSpText(15),  
    marginTop: ScreenUtil.autoheight(10), 
    lineHeight: ScreenUtil.autoheight(25),
  },
  moretext: {
    textAlign: "right", 
    fontSize: ScreenUtil.setSpText(13), 
    lineHeight: ScreenUtil.autoheight(20), 
  },
  pastTime: {
    fontSize: ScreenUtil.setSpText(13), 
    marginTop: ScreenUtil.autoheight(10),
    paddingBottom: ScreenUtil.autoheight(10), 
  },
  spotout: {
    flex: 1, 
    flexDirection: "row", 
    padding: ScreenUtil.autowidth(10)
  },
  updownimg: {
    width: ScreenUtil.autowidth(18), 
    height: ScreenUtil.autowidth(18)
  },
  updowntext: {
    fontSize: ScreenUtil.setSpText(13),
    marginLeft: ScreenUtil.autowidth(5), 
  },
  image: {
    marginRight: 2,
    height: "100%",
    width: ScreenWidth,
  },
});

export default News;





/**
 * 实现et.js/tp.js库对应的SDK 接口方法
 */

function callbackToSDK(methodName,callback, resp){
  if(Platform.OS === 'ios')
  {
    let dict = {methodName:methodName, callback: callback,resp:resp};
    IosSDKModule.getDictionaryFromRN(dict);
  }else if(Platform.OS === 'android')
  {
    NativeModules.SDKModule.callbackFromReactNative(methodName,callback, resp);
  }
}

// //输入密码,取私钥
function inputPwd(privateKey,salt,password,callback)
{
    // 解析密钥
    var plaintext_privateKey = "";
    try {
        var bytes_privateKey = CryptoJS.AES.decrypt(privateKey, password + salt);
         plaintext_privateKey = bytes_privateKey.toString(CryptoJS.enc.Utf8);
        if (plaintext_privateKey.indexOf('eostoken') != -1) {
            plaintext_privateKey = plaintext_privateKey.substr(8, plaintext_privateKey.length);
        } else {
            plaintext_privateKey = "";
        }
    } catch (error) {
        plaintext_privateKey = "";
    }

    if (callback)  callback(plaintext_privateKey);
}

//返回错误信息
function getErrorMsg(msg)
{
  var res = new Object();
  res.result = false;
  res.data = {};
  res.msg = msg;

  return  JSON.stringify(res);
}
function eosTokenTransfer(methodName,params,password, callback)
{
    var obj_param;
    try {
      obj_param = JSON.parse(params);
      if (!obj_param || !obj_param.from || !obj_param.to || !obj_param.amount || !obj_param.tokenName 
             || !obj_param.contract || !obj_param.precision || !password) {
        console.log('eosTokenTransfer:missing params; "from", "to", "amount", "tokenName","contract", "precision" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
      }
      var type_amount = typeof(obj_param.amount);
      if(type_amount == "number")
      {
        obj_param.amount = obj_param.amount.toString();
      }else if(type_amount == "string")
      {
          // 需要的是 string
      }else
      {
        console.log("eosTokenTransfer error: amount is not number or string");
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("amount参数类型非法"));
        return ;
      }
      var type_precision = typeof(obj_param.precision);
      if(type_precision == "number")
      {
          // 需要的是 number
      }else if(type_precision == "string")
      {
        obj_param.precision = parseInt(obj_param.precision);
      }else
      {
        console.log("eosTokenTransfer error: precision is not number or string");
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("precision参数类型非法"));
        return ;
      }
      if (password == "" || password.length < Constants.PWD_MIN_LENGTH) {
        console.log("eosTokenTransfer error: 密码长度错");
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("密码长度错"));
        return ;
      }
    } catch (error) {
      console.log("eosTokenTransfer error: %s",error.message);
      if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
      return ;
    }
    //可选项
    obj_param.memo = obj_param.memo ? obj_param.memo : "";
    obj_param.address = obj_param.address ? obj_param.address : "";

    var res = new Object();
    res.result = false;
    res.data = {};

    var is_activePrivate = true; //是否使用active私钥

    new Promise(function(resolve, reject){
      g_props.dispatch({type:'wallet/walletList',callback:(walletArr)=>{ 
          if (walletArr == undefined || walletArr == null || walletArr.length < 1) {
            reject({message:"get walletList error"});
          }else{
            for(var i = 0;i < walletArr.length;i++)
            {
              //激活的账户
              if((walletArr[i].isactived) && (walletArr[i].account == obj_param.from))
              {
                 if(obj_param.address)
                 {  //传公钥，则校验
                    if(walletArr[i].ownerPublic == obj_param.address)
                    {
                      is_activePrivate = false; //用owner私钥
                      break;
                    }else if((walletArr[i].activePublic == obj_param.address)){
                      is_activePrivate = true; //用active私钥
                      break;
                    }else{
                      //输入公钥 不匹配
                    }
                 }else{
                    break; 
                 }
              }
            }

            if(i >= walletArr.length)
            {
              reject({message:"from account is not exist or not actived"});
            }else{
              resolve(walletArr[i]);
            }
          }
        }
      });
    })
    .then((rdata)=>{
        var privateKey = (is_activePrivate == true) ? rdata.activePrivate : rdata.ownerPrivate;
        return  new Promise(function(resolve, reject){
          inputPwd(privateKey,rdata.salt,password,(data) => {
            if(data){
              //密码正确 ,返回私钥
              resolve(data);
            }else{
              //密码错误
              reject({message:"密码错误"});
            }
          });
        });
    })
    .then((rdata)=>{
        var plaintext_privateKey = rdata; 
        Eos.transfer(obj_param.contract, obj_param.from, obj_param.to, formatEosQua(obj_param.amount + " " + obj_param.tokenName,obj_param.precision), obj_param.memo, plaintext_privateKey, true, (r) => {
            try {
              if(r && r.isSuccess)
              {
                g_props.dispatch({type: 'wallet/pushTransaction', payload: { from: obj_param.from, to: obj_param.to, amount: formatEosQua(obj_param.amount + " " + obj_param.tokenName,obj_param.precision), memo: obj_param.memo, data: "push"}});
                res.result = true;
                res.data.transactionId = r.data.transaction_id ? r.data.transaction_id : "";
                console.log("transfer ok");
              }else{
                var errmsg = ((r.data && r.data.msg) ? r.data.msg : "");
                console.log("transfer %s",errmsg);
                res.result = false;
                res.msg = errmsg;
              }
              if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
            } catch (error) {
              console.log("eosTokenTransfer error: %s",error.message);
              if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
            }
        });
    })
    .catch((error)=>{
        console.log("eosTokenTransfer error: %s",error.message);
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
    });

}

function pushEosAction(methodName,params,password, callback)
{
    var obj_param;
    try{
      obj_param = JSON.parse(params);
      if (!obj_param || !obj_param.actions || !obj_param.account || !password) {
          console.log('pushEosAction:missing params; "actions" is required ');
          if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
          return;
      }
      if (password == "" || password.length < Constants.PWD_MIN_LENGTH) {
        console.log("pushEosAction error: 密码长度错");
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("密码长度错"));
        return ;
      }
      //可选项
      obj_param.address = obj_param.address ? obj_param.address : "";
    }catch(error){
      console.log("pushEosAction error: %s",error.message);
      if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
    }
    
    var res = new Object();
    res.result = false;
    res.data = {};

    var is_activePrivate = true; //是否使用active私钥
    
    new Promise(function(resolve, reject){
      g_props.dispatch({type:'wallet/walletList',callback:(walletArr)=>{ 
          if (walletArr == undefined || walletArr == null || walletArr.length < 1) {
            reject({message:"get walletList error"});
          }else{
            for(var i = 0;i < walletArr.length;i++)
            {
              //激活的账户
              if((walletArr[i].isactived) && (walletArr[i].account == obj_param.account))
              {
                if(obj_param.address)
                { //传公钥，则校验
                  if(walletArr[i].ownerPublic == obj_param.address)
                  {
                    is_activePrivate = false; //用owner私钥
                    break;
                  }else if((walletArr[i].activePublic == obj_param.address)){
                    is_activePrivate = true; //用active私钥
                    break;
                  }else{
                    //输入公钥 不匹配
                  }
                }else{
                  break;
                }
              }
            }

            if(i >= walletArr.length)
            {
              reject({message:"account is not exist or not actived"});
            }else{
              resolve(walletArr[i]); 
            }
          }
        }
      });
    })
    .then((rdata)=>{
        var privateKey = (is_activePrivate == true) ? rdata.activePrivate : rdata.ownerPrivate;
        return  new Promise(function(resolve, reject){
          inputPwd(privateKey,rdata.salt,password,(data) => {
            if(data){
              //密码正确 ,返回私钥
              resolve(data);
            }else{
              //密码错误
              reject({message:"密码错误"});
            }
          });
        });
    })
    .then((rdata)=>{
        var plaintext_privateKey = rdata;
        Eos.transaction({actions: obj_param.actions}, plaintext_privateKey, (r) => {
          try {
            if(r && r.isSuccess)
            {
              res.result = true;
              res.data.transactionId = r.data.transaction_id ? r.data.transaction_id : "";
              console.log("pushEosAction ok");
            }else{
              var errmsg = ((r.data && r.data.msg) ? r.data.msg : "");
              console.log("pushEosAction %s",errmsg);
              res.result = false;
              res.msg = errmsg;
            }
            if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
          } catch (error) {
            console.log("pushEosAction error: %s",error.message);
            if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
          }
        
      });
    })
    .catch((error)=>{
        console.log("pushEosAction error: %s",error.message);
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
    });

}
function getEosBalance(methodName,params, callback)
{
  try{
    var obj_param = JSON.parse(params);
    if (!obj_param || !obj_param.account || !obj_param.contract || !obj_param.symbol) {
        console.log('getEosBalance:missing params; "account", "contract", "symbol" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
    }
    
    var res = new Object();
    res.result = false;
    res.data = {};
    res.msg = "";
    g_props.dispatch({
      type: 'wallet/getBalance', payload: { contract: obj_param.contract, account: obj_param.account, symbol: obj_param.symbol }, callback: (resp) => {
        try {
          if (resp && resp.code == '0') {
            if (resp.data == "") {
              res.data.balance = '0.0000';
            } else {
              res.data.balance = resp.data;
            }
            res.result = true;
            res.data.symbol = obj_param.symbol;
            res.data.contract = obj_param.contract;
            res.data.account = obj_param.account;
            res.msg = "success";
          } else {
              var errmsg = ((resp.data && resp.data.msg) ? resp.data.msg : "");
              console.log("getEosBalance %s",errmsg);
              res.result = false;
              res.msg = errmsg;
          }
          if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
        } catch (error) {
          console.log("getEosBalance error: %s",error.message);
          if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
        }
      }
    })

  }catch(error){
    console.log("getEosBalance error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

}

function getEosTableRows(methodName,params, callback)
{
  try{
    var obj_param = JSON.parse(params);
    if (!obj_param || !obj_param.json || !obj_param.code || !obj_param.table) {
        console.log('getEosTableRows:missing params; "json", "code", "table" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
    }

  var res = new Object();
  res.result = false;
  res.data = {};
  res.msg = "";

  var objpayload = new Object();
  objpayload.json = obj_param.json;
  objpayload.code = obj_param.code;
  if(!obj_param.scope)
  { //DAPP 不传，默认用code
    obj_param.scope = obj_param.code;
  }
  objpayload.scope = obj_param.scope;
  objpayload.table = obj_param.table;
  if(obj_param.table_key)  
  {
    objpayload.table_key = obj_param.table_key;
  }
  if(obj_param.lower_bound)
  {
    objpayload.lower_bound = obj_param.lower_bound;
  }
  else if(obj_param.upper_bound)
  {
    objpayload.upper_bound = obj_param.upper_bound;
  }
  objpayload.limit = obj_param.limit ? obj_param.limit : 10;
  g_props.dispatch({
    type: 'wallet/getEosTableRows', payload: objpayload, callback: (resp) => {
      try {
        if (resp && resp.code == '0') {
          res.result = true;
          var obj = JSON.parse(resp.data);
          res.data.rows = obj.rows;
          res.msg = "success";
        } else {
            var errmsg = ((resp.data && resp.data.msg) ? resp.data.msg : "error");
            console.log("getEosTableRows %s",errmsg);
            res.result = false;
            res.msg = errmsg;
        }
        if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
      } catch (error) {
        console.log("getEosTableRows error: %s",error.message);
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
      }
    }
  });

  }catch(error){
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

}

function getEosAccountInfo(methodName,params, callback)
{
  try{
    var obj_param = JSON.parse(params);
    if (!obj_param || !obj_param.account) {
        console.log('getEosAccountInfo:missing params; "account" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
    }
    
    var res = new Object();
    res.result = false;
    res.data = {};
    res.msg = "";
    g_props.dispatch({ type: 'vote/getaccountinfo', payload: { page:1,username: obj_param.account},callback: (resp) => {
      try {
        if(resp){
          res.result = true;
          res.data = resp;
          res.msg = "success";
        }else{
          res.result = false;
          res.msg = "fail";
        }
        if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
      } catch (error) {
        console.log("getEosAccountInfo error: %s",error.message);
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
      }
    } });

  }catch(error){
    console.log("getEosAccountInfo error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }
}
function getEosTransactionRecord(methodName,params, callback)
{
  try{
    var obj_param = JSON.parse(params);
    if (!obj_param || !obj_param.account) {
        console.log('getEosTransactionRecord:missing params; "account" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
    }
   
    obj_param.start = obj_param.start ? obj_param.start : 0;
    obj_param.count = obj_param.count ? obj_param.count : 10;
    if(obj_param.start < 0 || obj_param.count < 1){
      console.log('getEosTransactionRecord:params; "count","start" is error ');
      if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
      return;
    }
    if(obj_param.sort){
        if(!(obj_param.sort == 'desc' || obj_param.sort == 'asc'))
        {
            throw new Error('sort should be desc or asc');
            console.log('getEosTransactionRecord:sort should be desc or asc ');
            if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
            return;
        }
    }else{
      obj_param.sort = 'desc';
    }
    obj_param.token = obj_param.token ? obj_param.token : "";
    obj_param.contract = obj_param.contract ? obj_param.contract : "";

  var res = new Object();
  res.result = false;
  res.data = {};
  res.msg = "";

  var objpayload = new Object();
  objpayload.account = obj_param.account;
  objpayload.start = obj_param.start;
  objpayload.count = obj_param.count;
  objpayload.sort = obj_param.sort;
  if(obj_param.token)
  {
    objpayload.token = obj_param.token;
  }
  if(obj_param.contract)
  {
    objpayload.contract = obj_param.contract;
  }

  g_props.dispatch({
    type: 'wallet/getEosTransactionRecord', payload: objpayload, callback: (resp) => {
      try {
        if (resp && resp.code == '0') {
          res.result = true;
          res.data = resp.data;
          res.msg = "success";
        } else {
            var errmsg = ( resp.msg ? resp.msg : "");
            console.log("getEosTransactionRecord %s",errmsg);
            res.result = false;
            res.msg = errmsg;
        }
        if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
      } catch (error) {
        console.log("getEosTransactionRecord error: %s",error.message);
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
      }
    }
  });

  }catch(error){
    console.log("getEosTransactionRecord error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

}

function eosAuthSign(methodName,params,password,callback)
{
  var obj_param;
  try{
     obj_param = JSON.parse(params);
    if (!obj_param || !obj_param.from || !obj_param.publicKey || !obj_param.signdata || !password) {
        console.log('eosAuthSign:missing params; "from","publicKey","signdata","password" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
    }
    if (password == "" || password.length < Constants.PWD_MIN_LENGTH) {
      console.log("eosAuthSign error: 密码长度错");
      if (callback)  callbackToSDK(methodName,callback,getErrorMsg("密码长度错"));
      return ;
    }
  }catch(error){
    console.log("eosAuthSign error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

  var res = new Object();
  res.result = false;
  res.data = {};
  res.msg = "";

  var is_activePrivate = true; //是否使用active私钥

  new Promise(function(resolve, reject){
    g_props.dispatch({type:'wallet/walletList',callback:(walletArr)=>{ 
        if (walletArr == undefined || walletArr == null || walletArr.length < 1) {
          reject({message:"get walletList error"});
        }else{
          for(var i = 0;i < walletArr.length;i++)
          {
            //激活的账户,账户,公钥匹配
            if((walletArr[i].isactived) && (walletArr[i].account == obj_param.from))
            {
              if(walletArr[i].ownerPublic == obj_param.publicKey)
              {
                is_activePrivate = false; //用owner私钥
                break;
              }else if((walletArr[i].activePublic == obj_param.publicKey)){
                is_activePrivate = true; //用active私钥
                break;
              }else{
                //输入公钥 不匹配
              }
            }
          }

          if(i >= walletArr.length)
          {
            reject({message:"account is not exist or not actived"});
          }else{
            resolve(walletArr[i]); 
          }
        }
      }
    });
  })
  .then((rdata)=>{
      var privateKey = (is_activePrivate == true) ? rdata.activePrivate : rdata.ownerPrivate;
      return  new Promise(function(resolve, reject){
        inputPwd(privateKey,rdata.salt,password,(data) => {
          if(data){
            //密码正确 ,返回私钥
            resolve(data);
          }else{
            //密码错误
            reject({message:"密码错误"});
          }
        });
      });
  })
  .then((rdata)=>{
    var plaintext_privateKey = rdata;
    Eos.sign(obj_param.signdata, plaintext_privateKey, (r) => {
        try {
          if(r && r.isSuccess)
          {
            res.result = true;
            res.data.signature = r.data;
            res.data.ref = 'EosToken';
            res.data.signdata = obj_param.signdata;

            let  now = moment();
            res.data.timestamp = now.valueOf();
            res.data.wallet = obj_param.from;  

            res.msg = "success";
            console.log("eosAuthSign ok");
          }else{
            var errmsg = ((r.data && r.data.msg) ? r.data.msg : "");
            console.log("eosAuthSign %s",errmsg);
            res.result = false;
            res.msg = errmsg;
          }
          if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
        } catch (error) {
          console.log("eosAuthSign error: %s",error.message);
          if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
        }
    });
  })
  .catch((error)=>{
      console.log("eosAuthSign error: %s",error.message);
      if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  });

}

function getAppInfo(methodName,callback)
{
  try{
    var res = new Object();
    res.result = true;
    res.data = {name:"EosToken",system:"",version:"",sys_version:"26"};
    if(Platform.OS === 'ios')
    {
      res.data.system = "ios";
      res.data.sys_version =  "11";  //TODO
    }else{
      res.data.system = "android";
      res.data.sys_version =  "26";
    }
    res.data.version =  DeviceInfo.getVersion();
    res.msg = "success";
    if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
  }catch(error){
    console.log("getAppInfo error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

}

function getWalletList(methodName,params, callback)
{
  try{
    var obj_param = JSON.parse(params);
    if (!obj_param || !obj_param.type) {
        console.log('getWalletList:missing params; "type" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
    }
    var res = new Object();
    res.wallets = {eos:[]};
    g_props.dispatch({type:'wallet/walletList',callback:(walletArr)=>{ 
      try {
        if (walletArr == undefined || walletArr == null || walletArr.length < 1) {
          //返回错误
          IosSDKModule.iosDebugInfo("返回错误 getWalletList callback:"+walletArr);
        }else{
          var objarray = new Array();
          for(var i = 0;i < walletArr.length;i++)
          {
             //激活账户才返回
            if(walletArr[i].isactived)
            {
              var tmpobj = new Object();
              tmpobj.name = walletArr[i].name;
              tmpobj.address = walletArr[i].activePublic;
              var floatbalance = 0;
              try {
                  floatbalance = parseFloat(walletArr[i].balance);
              } catch (error) {
                floatbalance = 0;
              }
              tmpobj.tokens = {eos:floatbalance}; 

              objarray[i] = tmpobj;
            }
          }
          res.wallets.eos = objarray;
        }
        if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
      } catch (error) {
        console.log("walletList error: %s",error.message);
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
      }
    }
  });

  }catch(error){
    console.log("getWalletList error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }
 
}

function getCurrentWallet(methodName,callback)
{
  try{
    var res = new Object();
    res.result = false;
    res.data = {name:"",address:"",blockchain_id:4};
    res.msg = "";
    g_props.dispatch({
      type: 'wallet/getDefaultWallet', callback: (data) => {
          try {
            if (data != null && data.defaultWallet.account != null) {
              res.result = true;
              res.data.name = data.defaultWallet.name;
              res.data.address = data.defaultWallet.activePublic;
              res.msg = "success";
            } else {
                res.result = false;
                res.msg = "fail";
            }
            if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
          } catch (error) {
            console.log("getDefaultWallet error: %s",error.message);
            if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
          }
      }
    });

  }catch(error){
    console.log("getCurrentWallet error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

}
function getWallets(methodName,callback)
{
  try{
    var res = new Object();
    res.result = true;
    res.data = [];

    g_props.dispatch({type:'wallet/walletList',callback:(walletArr)=>{ 
       try {
        if (walletArr == undefined || walletArr == null || walletArr.length < 1) {
          res.result = false;
          res.msg = "fail";
        }else{
          res.result = true;
          var objarray = new Array();
          for(var i = 0;i < walletArr.length;i++)
          {
            //激活账户才返回
            if(walletArr[i].isactived)
            {
              var tmpobj = new Object();
              tmpobj.name = walletArr[i].name;
              tmpobj.address = walletArr[i].activePublic;
              tmpobj.blockchain_id = 4;  //4 for EOS

              objarray[i] = tmpobj;
            }
          }
          res.data = objarray;
          res.msg = "success";
        }
        if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
       } catch (error) {
        console.log("getWallets error: %s",error.message);
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
       }
    }

  });
    
  }catch(error){
    console.log("getWallets error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

}

function sign(methodName,params,password,device_id,callback)
{
  var obj_param;
  try{
     obj_param = JSON.parse(params);
    if (!obj_param || !obj_param.appid || !password) {
        console.log('sign:missing params; "appid" is required ');
        if (callback)  callbackToSDK(methodName,callback,getErrorMsg("输入参数错误"));
        return;
    }
    if (password == "" || password.length < Constants.PWD_MIN_LENGTH) {
      console.log("sign error: 密码长度错");
      if (callback)  callbackToSDK(methodName,callback,getErrorMsg("密码长度错"));
      return ;
    }
  }catch(error){
    console.log("sign error: %s",error.message);
    if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  }

  var res = new Object();
  res.result = false;
  res.data = {};
  res.msg = "";

  new Promise(function(resolve, reject){
    g_props.dispatch({type:'wallet/getDefaultWallet',callback:(data)=>{ 
        if (data != null && data.defaultWallet.account != null)
        {
          resolve(data.defaultWallet);
        }
        else{
          reject({message:"getDefaultWallet error"});
        }
      }
    });
  })
  .then((rdata)=>{
      return  new Promise(function(resolve, reject){
        inputPwd(rdata.activePrivate,rdata.salt,password,(data) => {
          if(data){
            //密码正确 ,返回私钥
            resolve(data);
          }else{
            //密码错误
            reject({message:"密码错误"});
          }
        });
      });
  })
  .then((rdata)=>{
    var plaintext_privateKey = rdata;
    Eos.sign(obj_param.appid, plaintext_privateKey, (r) => {
        try {
          if(r && r.isSuccess)
          {
            res.result = true;
            res.data.deviceId = device_id;  
            res.data.appid = obj_param.appid;

            let  now = moment();
            res.data.timestamp = now.valueOf();
            res.data.sign = r.data;
            res.msg = "success";
            console.log("sign ok");
          }else{
            var errmsg = ((r.data && r.data.msg) ? r.data.msg : "");
            console.log("sign %s",errmsg);
            res.result = false;
            res.msg = errmsg;
          }
          if (callback)  callbackToSDK(methodName,callback,JSON.stringify(res));
        } catch (error) {
          console.log("sign error: %s",error.message);
          if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
        }
    });
  })
  .catch((error)=>{
      console.log("sign error: %s",error.message);
      if (callback)  callbackToSDK(methodName,callback,getErrorMsg(error.message));
  });

}

function callMessage(methodName, params,password,device_id, callback)
{
   if(!methodName)
   {
       console.log("methodName is required");
       if (callback)  callbackToSDK('callMessage',callback,getErrorMsg("methodName is required"));
       return;
   }

   console.log("callMessage %s",methodName);
   switch(methodName){
       case 'eosTokenTransfer':
           eosTokenTransfer(methodName,params,password, callback);
           break;

       case 'pushEosAction':
           pushEosAction(methodName,params,password, callback);
           break;

       case 'getEosBalance':
           getEosBalance(methodName,params, callback);
           break;

       case 'getTableRows':
       case 'getEosTableRows':
           getEosTableRows(methodName,params, callback);
           break;

       case 'getEosAccountInfo':
           getEosAccountInfo(methodName,params, callback);
           break;

       case 'getEosTransactionRecord':
           getEosTransactionRecord(methodName,params, callback);
           break;

       case 'eosAuthSign':
           eosAuthSign(methodName,params,password, callback);
           break;

       //common
       case 'getAppInfo':
           getAppInfo(methodName,callback);
           break;    

       case 'getWalletList':
           getWalletList(methodName,params, callback);
           break;

       case 'getCurrentWallet':
           getCurrentWallet(methodName,callback);
           break;

       case 'getWallets':
           getWallets(methodName,callback);
           break;     

       case 'sign':
           sign(methodName,params,password,device_id,callback);
           break;  
           
       default :
           console.log("methodName error");
          if (callback)  callbackToSDK('callMessage',callback,getErrorMsg("methodName error"));
           break;
   }
}
