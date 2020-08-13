import React, {Component} from 'react';
import { feature } from 'topojson-client';
import axios from 'axios';
import { geoKavrayskiy7 } from 'd3-geo-projection';
import { geoGraticule, geoPath } from 'd3-geo';
import { select as d3Select } from 'd3-selection';
import * as d3Scale from 'd3-scale';//比例化
import { schemeCategory10  } from 'd3-scale-chromatic';
import { timeFormat as d3TimeFormat } from 'd3-time-format';
import {Spin} from "antd";

import { WORLD_MAP_URL,SAT_API_KEY, SATELLITE_POSITION_URL } from "../constants";

const width = 960;
const height = 600;

class WorldMap extends Component {
    constructor(){
        super();
        this.state = {
            map: null,
            color: d3Scale.scaleOrdinal(schemeCategory10),
            isLoad: false
        }
        this.refMap = React.createRef();
        this.refTrack = React.createRef();
    }

    componentDidMount() {
        axios.get(WORLD_MAP_URL)
            .then(res => {
                const { data } = res;
                const land = feature(data, data.objects.countries).features;
                this.generateMap(land);
            })
            .catch(e => console.log('err in fecth world map data ', e))
    }

    generateMap(land){
        const projection = geoKavrayskiy7()
            .scale(170)
            .translate([width / 2, height / 2])
            .precision(.1);

        const graticule = geoGraticule();

        const canvas = d3Select(this.refMap.current)
            .attr("width", width)
            .attr("height", height);

        const canvas2 = d3Select(this.refTrack.current)
            .attr("width", width)
            .attr("height", height);

        let context = canvas.node().getContext("2d");
        let context2 = canvas2.node().getContext("2d");

        let path = geoPath()
            .projection(projection)
            .context(context);

        land.forEach(ele => {
            context.fillStyle = '#B3DDEF';
            context.strokeStyle = '#000';
            context.globalAlpha = 0.7;
            context.beginPath();
            path(ele);
            context.fill();
            context.stroke();

            context.strokeStyle = 'rgba(220, 220, 220, 0.1)';
            context.beginPath();
            path(graticule());
            context.lineWidth = 0.1;
            context.stroke();

            context.beginPath();
            context.lineWidth = 0.5;
            path(graticule.outline());
            context.stroke();
        })


        this.setState({
            map: {
                projection: projection,
                graticule: graticule,
                context: context,
                context2: context2
            }
        })
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if(this.props.satData !== prevProps.satData){
            //get observer data
            const { observerLat, observerLong, duration } = this.props.observerData;
            //get duration
            const startTime = duration[0] * 60, endTime = duration[1] * 60;
            //get urls
            const urls = this.props.satData.map( sat => {
                const { satid } = sat;
                const url = `${SATELLITE_POSITION_URL}/${satid}/${observerLat}/${observerLong}/${startTime}/${endTime}/&apiKey=${SAT_API_KEY}`;
                //现在是准备好url了 但是没有发送
                return axios.get(url); //这样对于每个satellite
            });

            this.setState(() => ({ isLoad: true }));

            //fetch satallite pass
            axios.all(urls)
                .then(
                    axios.spread( (...args) => {//通过spread对收集到的数据进行分离和处理，对哪个care 就返回哪个
                        return args.map( item => item.data)
                    })//这里是完成了对数据的准备
                )
                .then(res => {//track the satellite
                    this.track(res);
                    this.setState(() => ({ isLoad: false }));
                })
                .catch(e => {
                    console.log('error in fetch satellite position');
                    alert('error in fetch satellite position' + e);
                })

        }
    }

    track(data) { //data是和卫星相关的数据， info and position
        console.log('2 -> ', data)
        const { duration } = this.props.observerData;
        const len = data[0].positions.length;//position length
        const { context2 } = this.state.map;
        let now = new Date();//基于当前时间做的图
        //一个点一个点的画
        let i = 0;
        let timer = setInterval(() => {
            // how much time passed from the start?
            let timePassed = Date.now() - now;//对图做一个加速 60倍

            if(i === 0){//第一次做图
                now.setSeconds(now.getSeconds() + duration[0] * 60);//修改时间点
            }

            let time = new Date(now.getTime() + 60 * timePassed); //用来显示时间的
            context2.clearRect(0, 0, width, height);//之前画的图 清除掉

            context2.font = "bold 14px sans-serif";
            context2.fillStyle = "#333";
            context2.textAlign = "center";
            //上面三行是timer的label
            context2.fillText(d3TimeFormat(time), width / 2, 10);//写完label 需要显示内容，用的就是上面定义好的时间

            if (i >= len) {//得先知道做了多少点了，if i>=len 说明做完了，那就要做一个清除
                clearInterval(timer); // finish the animation after 2 seconds
                return;
            }

            //否则需要做图
            // draw the animation at the moment timePassed
            data.forEach(sat => {
                const { info, positions} = sat;
                //info下有id
                // console.log('1111 -> ', info, positions);
                this.drawSat(info, positions[i]);//做图， position[i], 当前i的位置
            })

            i += 60;
        }, 1000)
    }

    drawSat(sat, pos){
        const name = (sat.satname).split('-')[1];//通过name解构一下 拿到name后面的id number
        const { projection, context2 } = this.state.map;
        const xy = projection([pos.satlongitude, pos.satlatitude]);//当前卫星的position得到一个坐标

        context2.fillStyle = this.state.color(name);
        context2.beginPath();
        context2.arc(xy[0],xy[1],4,0,2*Math.PI); //花了一个小的圆出来
        context2.fill(); //填充

        context2.font = "bold 11px sans-serif";
        context2.textAlign = "center";
        context2.fillText(name, xy[0], xy[1]+14);//小小的偏移 这样不会重叠
        //上面这些事卫星图片的label
    }

    render() {
        const { isLoad } = this.state;
        return (
            <div className="map-box">
                {
                    isLoad ?
                        <div className="spinner">
                            <Spin tip="Loading..." size="large" />
                        </div>
                        :
                        null
                }
                <canvas className="map" ref={this.refMap} />
                <canvas className="track" ref={this.refTrack} />
            </div>
        );
    }
}

export default WorldMap;
